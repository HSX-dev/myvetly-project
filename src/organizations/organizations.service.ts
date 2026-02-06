import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';

@Injectable()
export class OrganizationsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .select(`
        *,
        clinics (
          id,
          name,
          subdomain
        )
      `);

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Organization with id ${id} not found`);
    return data;
  }

  async create(createOrganizationDto: CreateOrganizationDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .insert(createOrganizationDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .update(updateOrganizationDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      const message = error.message || 'Failed to delete organization';
      const details = (error as any)?.details;
      const hint = (error as any)?.hint;
      const code = (error as any)?.code;

      if (code === '23503') {
        // Foreign key violation - organization has related records (clinics/users/etc.)
        throw new ConflictException(
          'Cannot delete organization because related records exist. Remove related clinics/users first.',
        );
      }

      if (code === '42501' || message.toLowerCase().includes('permission')) {
        throw new ForbiddenException('Not allowed to delete organization.');
      }

      if (message.toLowerCase().includes('row level security') || message.toLowerCase().includes('rls')) {
        throw new ForbiddenException('Delete blocked by row-level security policy.');
      }

      if (message.toLowerCase().includes('invalid input syntax')) {
        throw new BadRequestException(`Invalid organization id: ${id}`);
      }

      throw new InternalServerErrorException(
        details ? `${message} - ${details}` : hint ? `${message} - ${hint}` : message,
      );
    }

    return { success: true };
  }

  async getClinicsByOrganization(organizationId: string) {
    // Validate organizationId
    if (!organizationId || organizationId.trim() === '') {
      throw new BadRequestException('Organization ID is required.');
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('clinics')
        .select('*, organizations(id, name)')
        .eq('organization_id', organizationId);

      if (error) {
        console.error(`Error fetching clinics for organization ${organizationId}:`, error);
        
        // Handle specific Supabase errors
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          throw new NotFoundException(`Organization with id ${organizationId} not found.`);
        }
        
        if (error.code === '22P02' || error.message?.includes('invalid input syntax')) {
          throw new BadRequestException(`Invalid organization ID format: ${organizationId}`);
        }
        
        if (error.message?.toLowerCase().includes('permission') || 
            error.message?.toLowerCase().includes('row level security') ||
            error.message?.toLowerCase().includes('rls')) {
          throw new ForbiddenException(`Access denied: ${error.message}`);
        }
        
        // Generic error with the actual message
        throw new BadRequestException(`Failed to fetch clinics: ${error.message || 'Unknown error'}`);
      }

      return data || [];
    } catch (error) {
      // Re-throw HttpExceptions as-is
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      // Wrap unexpected errors
      console.error(`Unexpected error in getClinicsByOrganization for ${organizationId}:`, error);
      throw new InternalServerErrorException(
        `Failed to fetch clinics for organization: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getUsersByOrganization(organizationId: string) {
    // Validate organizationId
    if (!organizationId || organizationId.trim() === '') {
      throw new BadRequestException('Organization ID is required.');
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('users')
        .select(`
          id,
          auth_user_id,
          email,
          role,
          organization_id,
          clinic_id,
          status,
          created_at,
          has_set_password,
          profiles(id, first_name, last_name, avatar_url),
          clinics(id, name, created_at)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`Error fetching users for organization ${organizationId}:`, error);
        
        // Handle specific Supabase errors
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          throw new NotFoundException(`Organization with id ${organizationId} not found.`);
        }
        
        if (error.code === '22P02' || error.message?.includes('invalid input syntax')) {
          throw new BadRequestException(`Invalid organization ID format: ${organizationId}`);
        }
        
        if (error.message?.toLowerCase().includes('permission') || 
            error.message?.toLowerCase().includes('row level security') ||
            error.message?.toLowerCase().includes('rls')) {
          throw new ForbiddenException(`Access denied: ${error.message}`);
        }
        
        // Generic error with the actual message
        throw new BadRequestException(`Failed to fetch users: ${error.message || 'Unknown error'}`);
      }

      return data || [];
    } catch (error) {
      // Re-throw HttpExceptions as-is
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      // Wrap unexpected errors
      console.error(`Unexpected error in getUsersByOrganization for ${organizationId}:`, error);
      throw new InternalServerErrorException(
        `Failed to fetch users for organization: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getSubscriptionsByOrganization(organizationId: string) {
    // Validate organizationId
    if (!organizationId || organizationId.trim() === '') {
      throw new BadRequestException('Organization ID is required.');
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`Error fetching subscriptions for organization ${organizationId}:`, error);
        
        // Handle specific Supabase errors
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          throw new NotFoundException(`Organization with id ${organizationId} not found.`);
        }
        
        if (error.code === '22P02' || error.message?.includes('invalid input syntax')) {
          throw new BadRequestException(`Invalid organization ID format: ${organizationId}`);
        }
        
        if (error.message?.toLowerCase().includes('permission') || 
            error.message?.toLowerCase().includes('row level security') ||
            error.message?.toLowerCase().includes('rls')) {
          throw new ForbiddenException(`Access denied: ${error.message}`);
        }
        
        // Generic error with the actual message
        throw new BadRequestException(`Failed to fetch subscriptions: ${error.message || 'Unknown error'}`);
      }

      return data || [];
    } catch (error) {
      // Re-throw HttpExceptions as-is
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      // Wrap unexpected errors
      console.error(`Unexpected error in getSubscriptionsByOrganization for ${organizationId}:`, error);
      throw new InternalServerErrorException(
        `Failed to fetch subscriptions for organization: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getPlans() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) throw error;
    return data;
  }
}

