import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NotFoundException, DatabaseException } from '../../common/exceptions';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('supabase.url') || '';
    const supabaseKey = this.configService.get<string>('supabase.serviceKey') || '';
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Service Key must be configured');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to get pet data with context
  async getPetContext(petId: string) {
    try {
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

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Pet', petId);
        }
        this.logger.error(`Failed to fetch pet context: ${error.message}`);
        throw new DatabaseException('fetch pet context', error.message);
      }
      return pet;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof DatabaseException) {
        throw err;
      }
      this.logger.error(`Unexpected error fetching pet: ${err}`);
      throw new DatabaseException('fetch pet context');
    }
  }

  // Helper method to get pet medical records
  async getPetMedicalRecords(petId: string, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('medical_records')
        .select('*')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`Medical records query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching medical records: ${err}`);
      return [];
    }
  }

  // Helper method to get pet appointments
  async getPetAppointments(petId: string, limit = 5) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select('*')
        .eq('pet_id', petId)
        .order('appointment_time', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`Appointments query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching appointments: ${err}`);
      return [];
    }
  }

  // Helper method to get pet vaccinations
  async getPetVaccinations(petId: string) {
    try {
      const { data, error } = await this.supabase
        .from('vaccinations')
        .select('*')
        .eq('pet_id', petId)
        .order('date_administered', { ascending: false });

      if (error) {
        // Table might not exist - return empty array
        console.warn('Vaccinations query failed:', error.message);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }

  // Helper method to get pet medications
  async getPetMedications(petId: string) {
    try {
      const { data, error } = await this.supabase
        .from('medications')
        .select('*')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist - return empty array
        console.warn('Medications query failed:', error.message);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }
}
