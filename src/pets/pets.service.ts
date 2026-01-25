import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePetDto, UpdatePetDto } from './dto';

interface UserContext {
  id: string;
  user_id: string;
  clinic_id: string | null;
  organization_id: string | null;
  role: string;
}

@Injectable()
export class PetsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Validate that user has access to the requested clinic
   */
  private validateClinicAccess(user: UserContext, requestedClinicId: string): void {
    if (!user) {
      throw new ForbiddenException('User context is required');
    }

    // Super admin can access all clinics
    if (user.role === 'super_admin') {
      return;
    }

    // Org admin can access clinics in their organization
    if (user.role === 'org_admin') {
      // Will validate organization_id when fetching clinic
      return;
    }

    // Regular users can only access their own clinic
    if (user.clinic_id !== requestedClinicId) {
      throw new ForbiddenException('Access denied to this clinic');
    }
  }

  /**
   * Validate that user has access to a specific pet
   */
  private async validatePetAccess(user: UserContext, petId: string): Promise<void> {
    // Get pet to check clinic ownership
    const { data: pet, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (error || !pet) {
      throw new NotFoundException(`Pet with ID ${petId} not found`);
    }

    this.validateClinicAccess(user, pet.tenant_id);
  }

  async findAll(user: UserContext) {
    // If user has clinic_id, filter by it. Otherwise, return empty (shouldn't happen with proper auth)
    if (!user.clinic_id) {
      return [];
    }
    
    // Use findByClinic which includes validation
    return this.findByClinic(user.clinic_id, user);
  }

  async findByClinic(clinicId: string, user: UserContext) {
    if (!user) {
      throw new ForbiddenException('User context is required');
    }

    // Validate user has access to this clinic
    this.validateClinicAccess(user, clinicId);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select(
        `
        *,
        clients!client_id (
          id,
          user_id,
          users!user_id (
            id,
            email,
            full_name
          )
        )
      `,
      )
      .eq('tenant_id', clinicId);

    if (error) {
      console.error('Error fetching pets by clinic:', error);
      throw error;
    }

    // Transform the data to match PetWithOwner format
    return (data || []).map((pet: any) => {
      const client = pet.clients;
      const user = client?.users;

      let clientInfo: { id: string; first_name: string; last_name: string } | null = null;
      if (client && user) {
        const nameParts = (user.full_name || user.email?.split('@')[0] || 'Unknown').split(' ');
        clientInfo = {
          id: client.id,
          first_name: nameParts[0] || 'Unknown',
          last_name: nameParts.slice(1).join(' ') || '',
        };
      }

      const { clients: _, ...petData } = pet;
      return {
        ...petData,
        clients: clientInfo,
      };
    });
  }

  async findByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('*')
      .eq('client_id', clientId);

    if (error) throw error;
    return data || [];
  }

  async findWithVisits(clinicId: string, user: UserContext) {
    // Get pets with owner info (includes validation)
    const pets = await this.findByClinic(clinicId, user);

    if (!pets || pets.length === 0) {
      return [];
    }

    // Get pet IDs
    const petIds = pets.map((pet: any) => pet.id);

    // Fetch appointments for visit data
    const { data: appointmentsData } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('pet_id, appointment_time, service_type, status')
      .in('pet_id', petIds)
      .in('status', ['completed', 'checked_in'])
      .order('appointment_time', { ascending: false });

    // Create visits map
    const visitsMap = new Map();
    if (appointmentsData) {
      appointmentsData.forEach((appointment: any) => {
        if (!visitsMap.has(appointment.pet_id)) {
          visitsMap.set(appointment.pet_id, {
            last_visit_date: appointment.appointment_time,
            last_visit_type: appointment.service_type,
            total_visits: 1,
          });
        } else {
          const existing = visitsMap.get(appointment.pet_id);
          existing.total_visits++;
        }
      });
    }

    // Combine pets with visit data
    return pets.map((pet: any) => ({
      ...pet,
      ...(visitsMap.get(pet.id) || {}),
    }));
  }

  async findOne(id: string, user: UserContext) {
    // Validate user has access to this pet
    await this.validatePetAccess(user, id);
    
    const pet = await this.supabaseService.getPetContext(id);
    return pet;
  }

  async findOneWithOwner(id: string, user: UserContext) {
    // Validate user has access to this pet
    await this.validatePetAccess(user, id);
    const { data: petData, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('*')
      .eq('id', id)
      .single();

    if (petError) throw petError;
    if (!petData) throw new NotFoundException(`Pet with ID ${id} not found`);

    let clientInfo: { id: string; first_name: string; last_name: string } | null = null;

    // Fetch client info if pet has a client_id
    if (petData.client_id) {
      const { data: clientData } = await this.supabaseService
        .getClient()
        .from('clients')
        .select('id, user_id')
        .eq('id', petData.client_id)
        .single();

      if (clientData && clientData.user_id) {
        const { data: userData } = await this.supabaseService
          .getClient()
          .from('users')
          .select('id, email, full_name')
          .eq('id', clientData.user_id)
          .single();

        if (userData) {
          const nameParts = (userData.full_name || userData.email?.split('@')[0] || 'Unknown').split(' ');
          clientInfo = {
            id: clientData.id,
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
          };
        }
      }
    }

    return {
      ...petData,
      clients: clientInfo,
    };
  }

  async getSpecies() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_species')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getAllBreeds() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_breeds')
      .select('*')
      .eq('is_active', true)
      .order('species_id', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getBreedsBySpecies(speciesId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_breeds')
      .select('*')
      .eq('species_id', speciesId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async create(createPetDto: CreatePetDto, user: UserContext) {
    // Validate user has access to the clinic they're creating pet for
    if (createPetDto.tenant_id) {
      this.validateClinicAccess(user, createPetDto.tenant_id);
    } else if (user.clinic_id) {
      // If no tenant_id provided, use user's clinic
      createPetDto.tenant_id = user.clinic_id;
    } else {
      throw new ForbiddenException('Cannot create pet without clinic access');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .insert(createPetDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updatePetDto: UpdatePetDto, user: UserContext) {
    if (!user) {
      throw new ForbiddenException('User context is required');
    }

    // Validate user has access to this pet
    await this.validatePetAccess(user, id);

    // Note: tenant_id should not be updated via this endpoint for security
    // If needed, it should be a separate admin endpoint

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .update(updatePetDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string, user: UserContext) {
    // Validate user has access to this pet
    await this.validatePetAccess(user, id);

    const { error } = await this.supabaseService
      .getClient()
      .from('pets')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async getMedicalRecords(petId: string, limit = 10) {
    return this.supabaseService.getPetMedicalRecords(petId, limit);
  }

  async getAppointments(petId: string, limit = 5) {
    return this.supabaseService.getPetAppointments(petId, limit);
  }

  async getVaccinations(petId: string) {
    return this.supabaseService.getPetVaccinations(petId);
  }

  async getMedications(petId: string) {
    return this.supabaseService.getPetMedications(petId);
  }
}

