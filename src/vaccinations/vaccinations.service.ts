import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class VaccinationsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('vaccinations')
      .select('*, pets(*)')
      .order('date_administered', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('vaccinations')
      .select('*, pets(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Vaccination with id ${id} not found`);
    return data;
  }

  async findByPet(petId: string) {
    return this.supabaseService.getPetVaccinations(petId);
  }
}

