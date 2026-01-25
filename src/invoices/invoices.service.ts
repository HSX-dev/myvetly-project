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
      .from('invoices')
      .select(`
        *,
        clients:client_id (
          id,
          users:user_id (
            full_name,
            email
          )
        ),
        appointments:appointment_id (
          id,
          appointment_time,
          service_type,
          pet_id
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

