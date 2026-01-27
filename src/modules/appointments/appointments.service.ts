import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto';

@Injectable()
export class AppointmentsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*, pets(*), clients(*), clinics(*)')
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*, pets(*), clients(*), clinics(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Appointment with id ${id} not found`);
    return data;
  }

  async create(createAppointmentDto: CreateAppointmentDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert(createAppointmentDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update(updateAppointmentDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async findByClinic(clinicId: string, startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select('*, pets(*), clients(*)')
      .eq('clinic_id', clinicId);

    if (startDate) {
      query = query.gte('appointment_time', startDate);
    }
    if (endDate) {
      query = query.lte('appointment_time', endDate);
    }

    const { data, error } = await query.order('appointment_time', {
      ascending: true,
    });

    if (error) throw error;
    return data;
  }

  async findByPet(petId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*')
      .eq('pet_id', petId)
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    return data;
  }
}

