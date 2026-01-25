import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class ClientsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(user: UserContext) {
    const organizationId = user.organization_id;
    const role = user.role;

    let query = this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email )
      `);

    // Exclude deleted clients
    query = query.or('status.is.null,status.neq.deleted');

    // Only super_admin can see all clients across organizations
    // All other roles (including clinic_admin) should be filtered by organization
    if (role !== 'super_admin') {
      if (!organizationId) {
        return [];
      }
      // Include clients with matching organization_id OR null organization_id
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) {
      return [];
    }

    // Get all client IDs to fetch pets
    const clientIds = data.map(item => item.id);
    
    // Fetch pets for all clients
    const { data: petsData } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('id, name, client_id')
      .in('client_id', clientIds);

    // Create a map of client_id to pets
    const petsByClientId = new Map<string, Array<{ id: string; name: string }>>();
    if (petsData) {
      petsData.forEach(pet => {
        if (pet.client_id) {
          if (!petsByClientId.has(pet.client_id)) {
            petsByClientId.set(pet.client_id, []);
          }
          petsByClientId.get(pet.client_id)!.push({ id: pet.id, name: pet.name || 'Unnamed Pet' });
        }
      });
    }

    // Map the data to match frontend Client type
    const clients = data
      .map(item => {
        const user = Array.isArray(item.users) ? item.users[0] : item.users;
        const pets = petsByClientId.get(item.id) || [];

        return {
          id: item.id,
          phone: item.phone,
          organization_id: item.organization_id,
          clinic_id: item.clinic_id,
          user_id: item.user_id,
          created_at: item.created_at,
          first_name: user?.first_name ?? '',
          last_name: user?.last_name ?? '',
          full_name: user?.full_name ?? '',
          email: user?.email ?? '',
          clinic_name: 'N/A',
          address_state: item.address_state,
          gender: item.gender,
          client_type: item.client_type,
          status: item.status,
          pet_names: pets, // Store pets array for table display
        };
      })
      .filter(client => client.id); // Ensure we only return clients with valid IDs

    return clients;
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

