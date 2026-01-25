import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClinicDto, UpdateClinicDto } from './dto';

@Injectable()
export class ClinicsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('*');

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
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

  async update(id: string, updateClinicDto: UpdateClinicDto) {
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
        role,
        organization_id,
        clinic_id,
        status,
        created_at,
        has_set_password
      `)
      .eq('clinic_id', clinicId)
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

    // Map users with profile data
    const processedUsers = (data || []).map((user: any) => {
      const profile = profilesData.find((p: any) => p.id === user.auth_user_id);
      
      // Use full_name from database, or construct from profiles if database value is empty/email
      let full_name = user.full_name || '';
      
      // If database full_name is empty or just the email, try to construct from profiles
      if (!full_name || full_name === user.email) {
        if (profile && (profile.first_name || profile.last_name)) {
          full_name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        }
      }
      
      // Final fallback to email
      if (!full_name) {
        full_name = user.email;
      }

      return {
        ...user,
        profiles: profile,
        full_name
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
}

