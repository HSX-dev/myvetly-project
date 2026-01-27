import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';

@Injectable()
export class PrescriptionsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select('*, pets(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select('*, pets(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Prescription with id ${id} not found`);
    return data;
  }

  async findByPet(petId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

