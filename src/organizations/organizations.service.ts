import { Injectable, NotFoundException } from '@nestjs/common';
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

    if (error) throw error;
    return { success: true };
  }

  async getClinicsByOrganization(organizationId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;
    return data;
  }

  async getUsersByOrganization(organizationId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;
    return data;
  }
}

