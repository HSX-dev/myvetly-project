import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClinicDto, UpdateClinicDto, CreateClinicServiceDto, UpdateClinicServiceDto } from './dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class ClinicsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(organizationId?: string) {
    // Build query for clinics
    let clinicsQuery = this.supabaseService
      .getClient()
      .from('clinics')
      .select('*');

    // Filter by organization_id if provided
    if (organizationId) {
      clinicsQuery = clinicsQuery.eq('organization_id', organizationId);
    }

    const { data: clinics, error: clinicsError } = await clinicsQuery;

    if (clinicsError) throw clinicsError;
    if (!clinics || clinics.length === 0) return [];

    // Get unique organization IDs
    const organizationIds = [...new Set(clinics.map(c => c.organization_id).filter(Boolean))];
    
    // Fetch organizations
    let organizationsMap: Record<string, any> = {};
    if (organizationIds.length > 0) {
      const { data: organizations, error: orgsError } = await this.supabaseService
        .getClient()
        .from('organizations')
        .select('id, name')
        .in('id', organizationIds);

      if (orgsError) throw orgsError;
      
      // Create a map for easy lookup
      organizationsMap = (organizations || []).reduce((acc, org) => {
        acc[org.id] = org;
        return acc;
      }, {} as Record<string, any>);
    }

    // Combine clinics with their organizations
    return clinics.map(clinic => ({
      ...clinic,
      organizations: clinic.organization_id && organizationsMap[clinic.organization_id]
        ? [organizationsMap[clinic.organization_id]]
        : [],
    }));
  }

  async findOne(id: string, user?: any) {
    // Validate user has access to this clinic
    if (user?.clinic_id && user.clinic_id !== id && user.role !== 'super_admin' && user.role !== 'org_admin') {
      throw new NotFoundException('Clinic not found or access denied');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Clinic with id ${id} not found`);
    return data;
  }

  async create(createClinicDto: CreateClinicDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .insert(createClinicDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateClinicDto: UpdateClinicDto, user?: any) {
    // Validate user has access to this clinic
    if (user?.clinic_id && user.clinic_id !== id && user.role !== 'super_admin' && user.role !== 'org_admin') {
      throw new NotFoundException('Clinic not found or access denied');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .update(updateClinicDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async getUserRolesByClinic(clinicId: string, user: any) {
    // Validate user has access to this clinic
    if (user?.clinic_id && user.clinic_id !== clinicId && user.role !== 'super_admin') {
      throw new NotFoundException('Clinic not found or access denied');
    }
    
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('role')
      .eq('clinic_id', clinicId);

    if (error) throw error;
    return data;
  }

  async getUsersByClinic(clinicId: string, user: any) {
    // Validate user has access to this clinic
    if (user?.clinic_id && user.clinic_id !== clinicId && user.role !== 'super_admin') {
      throw new NotFoundException('Clinic not found or access denied');
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select(`
        id,
        auth_user_id,
        email,
        full_name,
        first_name,
        last_name,
        role,
        role_id,
        role_name,
        organization_id,
        clinic_id,
        status,
        created_at,
        updated_at,
        has_set_password,
        timezone,
        organizations!users_organization_id_fkey(id, name),
        clinics!users_clinic_id_fkey(id, name)
      `)
      .eq('clinic_id', clinicId)
      .neq('role', 'client')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Get user IDs to fetch profiles
    const userIds = (data || []).map(user => user.auth_user_id).filter(Boolean);
    
    let profilesData: any[] = [];
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await this.supabaseService
        .getClient()
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.warn('Warning: Error fetching profiles:', profilesError);
      } else {
        profilesData = profiles || [];
      }
    }

    // Map users with profile data and clinic/organization names
    const processedUsers = (data || []).map((user: any) => {
      const profile = profilesData.find((p: any) => p.id === user.auth_user_id);
      
      // Use full_name from database, or construct from first_name/last_name, or from profiles
      let full_name = user.full_name || '';
      
      // If database full_name is empty or just the email, try to construct from first_name/last_name
      if (!full_name || full_name === user.email) {
        if (user.first_name || user.last_name) {
          full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        } else if (profile && (profile.first_name || profile.last_name)) {
          full_name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        }
      }
      
      // Final fallback to email
      if (!full_name) {
        full_name = user.email;
      }

      // Extract clinic and organization names from joined data
      const clinicName = user.clinics?.name || (Array.isArray(user.clinics) ? user.clinics[0]?.name : null);
      const organizationName = user.organizations?.name || (Array.isArray(user.organizations) ? user.organizations[0]?.name : null);

      return {
        ...user,
        profiles: profile,
        full_name,
        clinic_name: clinicName,
        organization_name: organizationName,
      };
    });

    return processedUsers;
  }

  async getBranding(clinicId: string, user: any) {
    // Validate user has access to this clinic
    if (user?.clinic_id && user.clinic_id !== clinicId && user.role !== 'super_admin') {
      throw new NotFoundException('Clinic not found or access denied');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('name, logo_url, color_theme, color_style')
      .eq('id', clinicId)
      .single();

    if (error) throw new NotFoundException(`Clinic with id ${clinicId} not found`);
    return data;
  }

  // Clinic Services/Products methods
  async getClinicServices(clinicId: string, getActive?: boolean, user?: UserContext) {
    // Validate access
    if (user && user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot view services for other clinics');
    }

    let query = this.supabaseService
      .getClient()
      .from('clinic_services')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (getActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  async createClinicService(clinicId: string, createDto: CreateClinicServiceDto, user: UserContext) {
    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot create services for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinic_services')
      .insert({
        ...createDto,
        clinic_id: clinicId,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async updateClinicService(serviceId: string, updateDto: UpdateClinicServiceDto, user: UserContext) {
    // First get the service to check clinic_id
    const { data: service, error: fetchError } = await this.supabaseService
      .getClient()
      .from('clinic_services')
      .select('clinic_id')
      .eq('id', serviceId)
      .single();

    if (fetchError) throw new NotFoundException(`Service with id ${serviceId} not found`);

    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== service.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot update services from other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinic_services')
      .update(updateDto)
      .eq('id', serviceId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get service names for a clinic
   * This method replicates the logic from servicesService.getServiceNames()
   * It queries clinic_services_reference and clinic_services_offered tables
   */
  async getServiceNames(clinicId?: string, organizationId?: string, user?: UserContext) {
    if (!clinicId) {
      // If no clinic specified, return all reference services
      const { data, error } = await this.supabaseService
        .getClient()
        .from('clinic_services_reference')
        .select('service_name')
        .order('display_order');

      if (error) {
        console.error('Error fetching services:', error);
        throw new InternalServerErrorException(`Failed to fetch services: ${error.message}`);
      }

      return (data || []).map((s: any) => s.service_name);
    }

    // Get services that are enabled for this clinic
    const { data: enabledServices, error: enabledError } = await this.supabaseService
      .getClient()
      .from('clinic_services_offered')
      .select('service_name')
      .eq('clinic_id', clinicId)
      .eq('is_enabled', true);

    if (enabledError) {
      console.error('Error fetching enabled services:', enabledError);
      throw new InternalServerErrorException(`Failed to fetch enabled services: ${enabledError.message}`);
    }

    if (!enabledServices || enabledServices.length === 0) {
      // If no services enabled for this clinic, return all services as fallback
      console.warn('No services enabled in clinic_services_offered, returning all services');
      const { data, error } = await this.supabaseService
        .getClient()
        .from('clinic_services_reference')
        .select('service_name')
        .order('display_order');

      if (error) {
        console.error('Error fetching services:', error);
        throw new InternalServerErrorException(`Failed to fetch services: ${error.message}`);
      }

      return (data || []).map((s: any) => s.service_name);
    }

    // Return the enabled service names
    return enabledServices.map((s: any) => s.service_name);
  }
}

