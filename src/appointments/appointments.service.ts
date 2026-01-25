import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
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
      .from('appointments')
      .select(`
        *,
        clients!client_id (
          id,
          phone,
          user_id,
          users!user_id (
            id,
            full_name,
            email
          )
        ),
        users!vet_id (
          id,
          full_name
        )
      `)
      .eq('pet_id', petId)
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    
    // Transform data to match frontend interface
    return (data || []).map((appointment: any) => {
      const clientUser = appointment.clients?.users;
      const clientData = appointment.clients;
      const provider = appointment.users;

      return {
        ...appointment,
        client: clientUser ? {
          id: clientData?.id || '',
          full_name: clientUser.full_name || clientUser.email?.split('@')[0] || 'Unknown',
          email: clientUser.email || '',
          phone: clientData?.phone,
        } : undefined,
        provider: provider ? {
          id: provider.id,
          full_name: provider.full_name || 'Unknown Provider',
        } : undefined,
        clinic_id: appointment.tenant_id || appointment.clinic_id,
      };
    });
  }
}

