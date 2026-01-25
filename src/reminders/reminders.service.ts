import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class RemindersService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('reminders')
      .select('*, pets(*), clients(*)')
      .order('reminder_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('reminders')
      .select('*, pets(*), clients(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Reminder with id ${id} not found`);
    return data;
  }

  async findByPet(petId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('reminders')
      .select('*')
      .eq('pet_id', petId)
      .order('reminder_date', { ascending: true });

    if (error) throw error;
    return data;
  }
}

