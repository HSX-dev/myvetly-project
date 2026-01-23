import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClientDto, UpdateClientDto } from './dto';

@Injectable()
export class ClientsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('*, users(*), pets(*)');

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('*, users(*), pets(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Client with id ${id} not found`);
    return data;
  }

  async create(createClientDto: CreateClientDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .insert(createClientDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .update(updateClientDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async getPetsByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('*')
      .eq('client_id', clientId);

    if (error) throw error;
    return data;
  }

  async getAppointmentsByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*')
      .eq('client_id', clientId)
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    return data;
  }
}

