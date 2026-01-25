import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class InvoicesService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*, clients(*), pets(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*, clients(*), pets(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Invoice with id ${id} not found`);
    return data;
  }

  async findByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findByPet(petId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

