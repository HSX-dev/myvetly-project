import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { CreatePetDto, UpdatePetDto } from './dto';

@Injectable()
export class PetsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('*, clients(*), medical_records(*), appointments(*)');

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const pet = await this.supabaseService.getPetContext(id);
    return pet;
  }

  async create(createPetDto: CreatePetDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .insert(createPetDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updatePetDto: UpdatePetDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .update(updatePetDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('pets')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async getMedicalRecords(petId: string, limit = 10) {
    return this.supabaseService.getPetMedicalRecords(petId, limit);
  }

  async getAppointments(petId: string, limit = 5) {
    return this.supabaseService.getPetAppointments(petId, limit);
  }

  async getVaccinations(petId: string) {
    return this.supabaseService.getPetVaccinations(petId);
  }

  async getMedications(petId: string) {
    return this.supabaseService.getPetMedications(petId);
  }
}

