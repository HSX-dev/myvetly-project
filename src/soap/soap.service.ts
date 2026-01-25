import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class SoapService {
  constructor(private supabaseService: SupabaseService) {}

  async getSOAPAudit(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    // First, get the pet to check clinic_id
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        symptoms,
        notes,
        estimated_duration,
        emergency_level,
        is_telehealth,
        created_at,
        updated_at,
        pet_id,
        client_id,
        vet_id,
        tenant_id,
        users!vet_id(
          id,
          full_name
        ),
        clinic:clinics!tenant_id(id, name),
        note:soap_notes!appointment_id(
          id,
          created_at,
          appointment_id,
          created_by,
          title,
          subjective,
          objective,
          assessment,
          plan,
          discharge,
          medications
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Normalize the note field to always be an array
    // Supabase may return note as a single object, array, or null
    const normalizedData = (data || []).map((appointment: any) => {
      if (appointment.note) {
        // If note is not an array, convert it to an array
        appointment.note = Array.isArray(appointment.note) ? appointment.note : [appointment.note];
      } else {
        // If note is null/undefined, set it to empty array
        appointment.note = [];
      }
      return appointment;
    });
    
    return normalizedData;
  }

  async getSOAPAuditLatest(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select(`
        id,
        appointment_id,
        pet_id,
        created_by,
        title,
        subjective,
        objective,
        assessment,
        plan,
        discharge,
        medications,
        created_at,
        appointment:appointments(
          id,
          appointment_time,
          service_type,
          status
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no SOAP notes found, return null instead of error
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data;
  }

  async getSOAPByPet(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id, created_by, title, subjective, objective, assessment, plan, discharge, medications, created_at, updated_at')
      .eq('pet_id', petId)
      .maybeSingle(); // Use maybeSingle() to return null if no SOAP note found

    if (error) {
      // If no SOAP notes found, return null instead of error
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }
}

