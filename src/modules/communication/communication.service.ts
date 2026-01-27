import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';

@Injectable()
export class CommunicationService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('messages')
      .select('*, from_user:users(*), to_user:users(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('messages')
      .select('*, from_user:users(*), to_user:users(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Message with id ${id} not found`);
    return data;
  }

  async findByUser(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('messages')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

