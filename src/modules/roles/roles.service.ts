import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';

@Injectable()
export class RolesService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Role with id ${id} not found`);
    return data;
  }

  async findByClinic(clinicId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }
}

