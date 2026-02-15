import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';

@Injectable()
export class VaccinationsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('preventive_vaccinations')
      .select('*')
      .is('deleted_at', null)
      .order('date_given', { ascending: false, nullsFirst: false });

    if (error) {
      throw new BadRequestException(`Failed to fetch vaccinations: ${error.message}`);
    }

    return data || [];
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('preventive_vaccinations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Vaccination with id ${id} not found`);
      }
      throw new BadRequestException(`Failed to fetch vaccination: ${error.message}`);
    }

    return data;
  }

  /**
   * Get patient vaccinations with complex logic matching frontend
   * Includes pet species lookup, vaccines catalog matching, and status calculation
   */
  async findByPet(petId: string, user: UserContext) {
    // First, get the pet to find its species and validate access
    const { data: petData, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('species, tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !petData) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any clinic in their organization
        // We'd need to verify clinic belongs to org, but for now allow
      } else if (petData.tenant_id && user.clinic_id !== petData.tenant_id) {
        throw new ForbiddenException('Access denied: You do not have access to this pet');
      }
    }

    // Get species_id from pet_species table
    const { data: speciesData } = await this.supabaseService
      .getClient()
      .from('pet_species')
      .select('id')
      .eq('name', petData.species)
      .eq('is_active', true)
      .single();

    const speciesId = speciesData?.id;

    // Get all vaccines for this species from vaccines catalog
    const vaccinesMap = new Map<string, string>();
    if (speciesId) {
      const { data: vaccinesData } = await this.supabaseService
        .getClient()
        .from('vaccines')
        .select('id, name')
        .eq('species_id', speciesId)
        .eq('is_active', true);

      if (vaccinesData) {
        vaccinesData.forEach((vaccine: any) => {
          vaccinesMap.set(vaccine.name.toLowerCase(), vaccine.name);
        });
      }
    }

    // Now get vaccinations
    const { data, error } = await this.supabaseService
      .getClient()
      .from('preventive_vaccinations')
      .select(`
        id,
        vaccination_name,
        vaccination_type,
        date_given,
        last_given_date,
        due_date,
        next_due_date,
        status,
        notes,
        administered_by,
        created_at,
        updated_at,
        administered_by_user:users!administered_by (
          id,
          full_name
        )
      `)
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .order('date_given', { ascending: false, nullsFirst: false });

    if (error) {
      throw new BadRequestException(`Failed to fetch vaccinations: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Map to Vaccination interface matching frontend logic
    return data.map((vaccination: any) => {
      // Determine status
      let status: 'Current' | 'Overdue' | 'Upcoming' = 'Current';
      if (vaccination.status) {
        const statusLower = vaccination.status.toLowerCase();
        if (statusLower.includes('overdue')) status = 'Overdue';
        else if (statusLower.includes('upcoming') || statusLower === 'due') status = 'Upcoming';
        else status = 'Current';
      } else if (vaccination.due_date) {
        const dueDate = new Date(vaccination.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) {
          status = 'Overdue';
        } else if (dueDate > today) {
          status = 'Upcoming';
        }
      }

      // Get vaccine name - match with vaccines catalog if available
      let vaccine_name = vaccination.vaccination_name || '';
      if (vaccine_name) {
        const matchedVaccine = vaccinesMap.get(vaccine_name.toLowerCase());
        if (matchedVaccine) {
          vaccine_name = matchedVaccine; // Use the canonical name from vaccines catalog
        }
      }

      // Check if rabies vaccine (based on name)
      const is_rabies = vaccine_name.toLowerCase().includes('rabies') || false;

      // Get administered by name
      const verified_by = vaccination.administered_by_user?.full_name || 'Unknown';

      return {
        id: vaccination.id,
        vaccine_name,
        administration_date: vaccination.date_given || vaccination.last_given_date || vaccination.created_at,
        due_date: vaccination.due_date || vaccination.next_due_date,
        verified_by,
        is_rabies,
        notes: vaccination.notes,
        status,
        vaccination_type: vaccination.vaccination_type,
        date_given: vaccination.date_given,
        last_given_date: vaccination.last_given_date,
        next_due_date: vaccination.next_due_date,
        administered_by: vaccination.administered_by,
      };
    });
  }

  /**
   * Get vaccines by species name
   */
  async getVaccinesBySpecies(speciesName: string) {
    // First, get species_id from pet_species table by matching species name
    const { data: speciesData, error: speciesError } = await this.supabaseService
      .getClient()
      .from('pet_species')
      .select('id')
      .eq('name', speciesName)
      .eq('is_active', true)
      .single();

    if (speciesError || !speciesData) {
      return [];
    }

    // Then get vaccines for this species
    const { data, error } = await this.supabaseService
      .getClient()
      .from('vaccines')
      .select('id, name, species_id')
      .eq('species_id', speciesData.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch vaccines: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create a new vaccination
   */
  async create(createVaccinationDto: CreateVaccinationDto, user: UserContext) {
    // Validate pet access
    const { data: petData, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', createVaccinationDto.pet_id)
      .single();

    if (petError || !petData) {
      throw new NotFoundException(`Pet with id ${createVaccinationDto.pet_id} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any clinic in their organization
      } else if (petData.tenant_id && user.clinic_id !== petData.tenant_id) {
        throw new ForbiddenException('Access denied: You do not have access to this pet');
      }
    }

    // Use user's clinic_id if not provided
    const clinicId = createVaccinationDto.clinic_id || user.clinic_id;

    const { data: vaccination, error } = await this.supabaseService
      .getClient()
      .from('preventive_vaccinations')
      .insert([{
        pet_id: createVaccinationDto.pet_id,
        clinic_id: clinicId,
        vaccination_name: createVaccinationDto.vaccination_name,
        vaccination_type: createVaccinationDto.vaccination_type,
        date_given: createVaccinationDto.date_given,
        due_date: createVaccinationDto.due_date,
        next_due_date: createVaccinationDto.next_due_date || createVaccinationDto.due_date,
        administered_by: createVaccinationDto.administered_by || user.user_id,
        notes: createVaccinationDto.notes,
        status: createVaccinationDto.date_given ? 'completed' : 'upcoming',
      }])
      .select(`
        *,
        administered_by_user:users!administered_by (
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create vaccination: ${error.message}`);
    }

    const is_rabies = vaccination.vaccination_name?.toLowerCase().includes('rabies') || false;
    const verified_by = vaccination.administered_by_user?.full_name || 'Unknown';

    return {
      id: vaccination.id,
      vaccine_name: vaccination.vaccination_name || '',
      administration_date: vaccination.date_given || vaccination.created_at,
      due_date: vaccination.due_date,
      verified_by,
      is_rabies,
      notes: vaccination.notes,
      status: 'Current',
      vaccination_type: vaccination.vaccination_type,
      date_given: vaccination.date_given,
      next_due_date: vaccination.next_due_date,
      administered_by: vaccination.administered_by,
    };
  }
}

