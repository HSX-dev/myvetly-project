import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';

@Injectable()
export class TasksService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select('*, assigned_to:users(*), created_by:users(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select('*, assigned_to:users(*), created_by:users(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Task with id ${id} not found`);
    return data;
  }

  async findByUser(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select('*')
      .eq('assigned_to_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

