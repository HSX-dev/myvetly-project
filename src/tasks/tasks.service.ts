import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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

  async findByPet(petId: string, user: any) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user?.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select('*, assigned_to:users(*), created_by:users(*)')
      .eq('patient_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

