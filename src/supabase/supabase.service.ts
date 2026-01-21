import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('supabase.url'),
      this.configService.get<string>('supabase.serviceKey'),
    );
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to get pet data with context
  async getPetContext(petId: string) {
    const { data: pet, error } = await this.supabase
      .from('pets')
      .select(`
        *,
        clients!client_id (
          id,
          user_id,
          users!user_id (
            id,
            email,
            full_name
          )
        )
      `)
      .eq('id', petId)
      .single();

    if (error) throw error;
    return pet;
  }

  // Helper method to get pet medical records
  async getPetMedicalRecords(petId: string, limit = 10) {
    const { data, error } = await this.supabase
      .from('medical_records')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // Helper method to get pet appointments
  async getPetAppointments(petId: string, limit = 5) {
    const { data, error } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('pet_id', petId)
      .order('appointment_time', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // Helper method to get pet vaccinations
  async getPetVaccinations(petId: string) {
    const { data, error } = await this.supabase
      .from('vaccinations')
      .select('*')
      .eq('pet_id', petId)
      .order('date_administered', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Helper method to get pet medications
  async getPetMedications(petId: string) {
    const { data, error } = await this.supabase
      .from('medications')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
