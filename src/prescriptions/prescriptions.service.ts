import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';

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

  async findBySoapId(soapId: string, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapId)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${soapId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
    }

    // Get prescriptions
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select(`
        *,
        product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
        prescribed_doc:users!prescribed_by(id, full_name)
      `)
      .eq('soap_id', soapId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

