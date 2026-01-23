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

  async getUsersByClinic(clinicId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinic_users')
      .select('*, users(*)')
      .eq('clinic_id', clinicId);

    if (error) throw error;
    return data;
  }
}

