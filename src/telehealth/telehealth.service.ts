import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class TelehealthService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('*, appointments(*), pets(*), clients(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('*, appointments(*), pets(*), clients(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Telehealth session with id ${id} not found`);
    return data;
  }

  async findByAppointment(appointmentId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('*')
      .eq('appointment_id', appointmentId)
      .single();

    if (error) throw error;
    return data;
  }
}

