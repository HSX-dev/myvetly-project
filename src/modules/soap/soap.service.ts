import { Injectable, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException, BadGatewayException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { SoapService as AiSoapService } from '../ai/soap/soap.service';

@Injectable()
export class SoapService {
  constructor(
    private supabaseService: SupabaseService,
    private aiSoapService: AiSoapService,
  ) {}

  async getSOAPAudit(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    // First, get the pet to check clinic_id
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        symptoms,
        notes,
        estimated_duration,
        emergency_level,
        is_telehealth,
        created_at,
        updated_at,
        pet_id,
        client_id,
        vet_id,
        tenant_id,
        users!vet_id(
          id,
          full_name
        ),
        clinic:clinics!tenant_id(id, name),
        note:soap_notes!appointment_id(
          id,
          created_at,
          appointment_id,
          created_by,
          title,
          subjective,
          objective,
          assessment,
          plan,
          discharge,
          medications
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Normalize the note field to always be an array
    // Supabase may return note as a single object, array, or null
    const normalizedData = (data || []).map((appointment: any) => {
      if (appointment.note) {
        // If note is not an array, convert it to an array
        appointment.note = Array.isArray(appointment.note) ? appointment.note : [appointment.note];
      } else {
        // If note is null/undefined, set it to empty array
        appointment.note = [];
      }
      return appointment;
    });
    
    return normalizedData;
  }

  async getSOAPAuditLatest(petId: string, user: UserContext) {
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

    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select(`
        id,
        appointment_id,
        pet_id,
        created_by,
        title,
        subjective,
        objective,
        assessment,
        plan,
        discharge,
        medications,
        created_at,
        appointment:appointments(
          id,
          appointment_time,
          service_type,
          status
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no SOAP notes found, return null instead of error
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data;
  }

  async getSOAPByPet(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id, created_by, title, subjective, objective, assessment, plan, discharge, medications, created_at, updated_at')
      .eq('pet_id', petId)
      .maybeSingle(); // Use maybeSingle() to return null if no SOAP note found

    if (error) {
      // If no SOAP notes found, return null instead of error
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  async getSOAPByAppointment(appointmentId: string, user: UserContext) {
    // First, get the appointment to validate access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id, pet_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment with id ${appointmentId} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this appointment');
    }

    // Get SOAP note for this appointment
    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select(`
        *,
        appointment:appointments!appointment_id(
          id,
          pets(name, species)
        ),
        created_by_user:users!created_by(id, full_name)
      `)
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) {
      // If no SOAP notes found, return null instead of error
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  async getTreatmentPlansBySoapNote(soapNoteId: string, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Get treatment plans
    const { data, error } = await this.supabaseService
      .getClient()
      .from('treatment_plans')
      .select(`
        *,
        product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
        created_by_doc:users!created_by(id, full_name)
      `)
      .eq('soap_note_id', soapNoteId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getBodyMapsBySoapNote(soapNoteId: string, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Get body maps
    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .select('*')
      .eq('soap_note_id', soapNoteId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createSoapNote(data: any, user: UserContext) {
    // Validate appointment access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id, pet_id')
      .eq('id', data.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment with id ${data.appointment_id} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this appointment');
    }

    // Create SOAP note
    const { data: soapNote, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .insert({
        ...data,
        created_by: user.user_id, // Use user.user_id (users.id) instead of user.id (auth_user_id)
        pet_id: appointment.pet_id,
      })
      .select(`
        *,
        appointment:appointments!appointment_id(
          id,
          pets(name, species)
        ),
        created_by_user:users!created_by(id, full_name)
      `)
      .single();

    if (error) {
      // Check for foreign key violation
      if (error.code === '23503') {
        throw new BadRequestException(`Failed to create SOAP note: ${error.message}. Ensure the user exists in the users table.`);
      }
      throw new InternalServerErrorException(`Failed to create SOAP note: ${error.message}`);
    }
    return soapNote;
  }

  async updateSoapNote(id: string, data: any, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${id} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Update SOAP note
    const { data: updatedSoapNote, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .update(data)
      .eq('id', id)
      .select(`
        *,
        appointment:appointments!appointment_id(
          id,
          pets(name, species)
        ),
        created_by_user:users!created_by(id, full_name)
      `)
      .single();

    if (error) throw error;
    return updatedSoapNote;
  }

  async getSoapNoteById(id: string, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${id} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Get full SOAP note with relations
    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select(`
        *,
        appointment:appointments!appointment_id(
          id,
          pets(name, species)
        ),
        created_by_user:users!created_by(id, full_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async hasActiveExpansion(soapNoteId: string, user: UserContext): Promise<boolean> {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Check for active expansion
    const { data, error } = await this.supabaseService
      .getClient()
      .from('soap_ai_versions')
      .select('id')
      .eq('soap_notes_id', soapNoteId)
      .is('undone_at', null)
      .limit(1);

    if (error) {
      console.error('Error checking active expansion:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  }

  async getSoapNoteByPet(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new Error(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    // Fetch SOAP note
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id, created_by, title, subjective, objective, assessment, plan, discharge, medications, created_at, updated_at')
      .eq('pet_id', petId)
      .maybeSingle();

    if (soapError && soapError.code !== 'PGRST116') throw soapError; // PGRST116 = no rows found
    if (!soapNote) return null;

    // Fetch all related data
    const [appointmentData, petData, createdByUser, vitals, physical] = await Promise.all([
      // Fetch appointment (just ID)
      soapNote.appointment_id
        ? this.supabaseService
            .getClient()
            .from('appointments')
            .select('id')
            .eq('id', soapNote.appointment_id)
            .maybeSingle()
            .then(({ data, error }) => ({ data, error }))
        : Promise.resolve({ data: null, error: null }),

      // Fetch pet info
      this.supabaseService
        .getClient()
        .from('pets')
        .select('name, species')
        .eq('id', petId)
        .maybeSingle()
        .then(({ data, error }) => ({ data, error })),

      // Fetch created by user
      soapNote.created_by
        ? this.supabaseService
            .getClient()
            .from('users')
            .select('id, full_name')
            .eq('id', soapNote.created_by)
            .maybeSingle()
            .then(({ data, error }) => ({ data, error }))
        : Promise.resolve({ data: null, error: null }),

      // Fetch vitals
      this.supabaseService
        .getClient()
        .from('soap_vitals')
        .select('*')
        .eq('soap_notes_id', soapNote.id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => ({ data, error })),

      // Fetch physical exams
      this.supabaseService
        .getClient()
        .from('soap_physical')
        .select('*')
        .eq('soap_notes_id', soapNote.id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => ({ data, error }))
    ]);

    // Fetch supervisors for vitals if any exist
    let vitalsWithSupervisors = vitals.data || [];
    if (vitals.data && vitals.data.length > 0) {
      vitalsWithSupervisors = await Promise.all(
        vitals.data.map(async (vital: any) => {
          if (vital.supervising_user) {
            const { data: supervisor } = await this.supabaseService
              .getClient()
              .from('users')
              .select('id, full_name')
              .eq('id', vital.supervising_user)
              .maybeSingle();
            return { ...vital, supervisor: supervisor ? [supervisor] : [] };
          }
          return { ...vital, supervisor: [] };
        })
      );
    }

    // Fetch supervisors for physical exams if any exist
    let physicalWithSupervisors = physical.data || [];
    if (physical.data && physical.data.length > 0) {
      physicalWithSupervisors = await Promise.all(
        physical.data.map(async (phys: any) => {
          if (phys.supervising_user) {
            const { data: supervisor } = await this.supabaseService
              .getClient()
              .from('users')
              .select('id, full_name')
              .eq('id', phys.supervising_user)
              .maybeSingle();
            return { ...phys, supervisor: supervisor ? [supervisor] : [] };
          }
          return { ...phys, supervisor: [] };
        })
      );
    }

    // Combine all data
    const appointmentFormatted = appointmentData.data && petData.data
      ? {
          id: appointmentData.data.id,
          pets: {
            name: petData.data.name,
            species: petData.data.species
          }
        }
      : appointmentData.data
      ? { id: appointmentData.data.id }
      : null;

    const discharge = (soapNote as any).discharge || { 
      title: '', 
      instructions: '', 
      files: [] 
    };

    return {
      ...soapNote,
      appointment: appointmentFormatted,
      created_by_user: createdByUser.data || null,
      discharge: discharge,
      vitals: vitalsWithSupervisors,
      physical: physicalWithSupervisors
    };
  }

  async getBodyMapById(id: string, user: UserContext) {
    // Get body map
    const { data: bodyMap, error: bodyMapError } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .select('*, soap_notes!soap_note_id(appointment_id, pet_id)')
      .eq('id', id)
      .single();

    if (bodyMapError || !bodyMap) {
      if (bodyMapError?.code === 'PGRST116') {
        return null; // No rows found
      }
      throw new NotFoundException(`Body map with id ${id} not found`);
    }

    // Get appointment to check clinic access
    const appointmentId = (bodyMap.soap_notes as any)?.appointment_id;
    if (!appointmentId) {
      throw new NotFoundException(`Appointment not found for body map ${id}`);
    }

    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for body map ${id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this body map');
    }

    // Remove nested soap_notes from response
    const { soap_notes, ...bodyMapData } = bodyMap;
    return bodyMapData;
  }

  async createBodyMap(data: any, user: UserContext) {
    // Validate SOAP note access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', data.soap_note_id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${data.soap_note_id} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id, pet_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${data.soap_note_id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Get pet species if species not provided or to validate
    let petSpecies: string | null = null;
    const petId = soapNote.pet_id || appointment.pet_id;
    if (petId) {
      const { data: pet } = await this.supabaseService
        .getClient()
        .from('pets')
        .select('species')
        .eq('id', petId)
        .maybeSingle();
      if (pet?.species) {
        petSpecies = pet.species.toLowerCase().trim();
      }
    }

    // Create body map - remove appointment_id and image_url if present (not valid fields for soap_body_maps table)
    const { appointment_id, image_url, ...bodyMapData } = data;
    
    // Normalize species to lowercase and validate
    // If species not provided, try to get from pet
    if (!bodyMapData.species && petSpecies) {
      bodyMapData.species = petSpecies;
    }
    
    if (bodyMapData.species) {
      const normalizedSpecies = bodyMapData.species.toLowerCase().trim();
      // Map common variations to valid database values
      const speciesMap: Record<string, string> = {
        'bird': 'bird',
        'cat': 'cat',
        'dog': 'dog',
        'horse': 'horse',
        'cow': 'cow',
        'bull': 'bull',
        'ferret': 'ferret',
        'fish': 'fish',
        'goldfish': 'fish',
        'hamster': 'hamster',
        'guinea pig': 'guinea_pig',
        'guinea_pig': 'guinea_pig',
      };
      bodyMapData.species = speciesMap[normalizedSpecies] || normalizedSpecies;
    }
    
    const { data: bodyMap, error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .insert(bodyMapData)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create body map: ${error.message || 'Unknown error'}`);
    }

    return bodyMap;
  }

  async updateBodyMap(id: string, data: any, user: UserContext) {
    // First get the body map to validate access
    const bodyMap = await this.getBodyMapById(id, user);
    if (!bodyMap) {
      throw new NotFoundException(`Body map with id ${id} not found`);
    }

    // Update body map - remove appointment_id and image_url if present (not valid fields for soap_body_maps table)
    const { appointment_id, image_url, ...bodyMapData } = data;
    
    // Normalize species to lowercase and validate if provided
    if (bodyMapData.species) {
      const normalizedSpecies = bodyMapData.species.toLowerCase().trim();
      // Map common variations to valid database values
      const speciesMap: Record<string, string> = {
        'bird': 'bird',
        'cat': 'cat',
        'dog': 'dog',
        'horse': 'horse',
        'cow': 'cow',
        'bull': 'bull',
        'ferret': 'ferret',
        'fish': 'fish',
        'goldfish': 'fish',
        'hamster': 'hamster',
        'guinea pig': 'guinea_pig',
        'guinea_pig': 'guinea_pig',
      };
      bodyMapData.species = speciesMap[normalizedSpecies] || normalizedSpecies;
    }
    
    const { data: updatedBodyMap, error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .update(bodyMapData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update body map: ${error.message || 'Unknown error'}`);
    }

    return updatedBodyMap;
  }

  async deleteBodyMap(id: string, user: UserContext) {
    // First get the body map to validate access and get thumbnail URL
    const bodyMap = await this.getBodyMapById(id, user);
    if (!bodyMap) {
      throw new NotFoundException(`Body map with id ${id} not found`);
    }

    // Delete body map
    const { error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete body map: ${error.message || 'Unknown error'}`);
    }

    // Return thumbnail URL and soap_note_id so frontend can delete it from storage
    return {
      success: true,
      thumbnail_url: (bodyMap as any).thumbnail_url,
      soap_note_id: (bodyMap as any).soap_note_id,
    };
  }

  async expandSOAP(
    soapNoteId: string,
    section: 'subjective' | 'objective' | 'assessment' | 'plan' | 'all' | undefined,
    currentData: any,
    user: UserContext,
  ): Promise<any> {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    let result: any;
    try {
      result = await this.aiSoapService.expand(
        {
          appointment_id: appointment.id,
          section,
          current_data: currentData,
        },
        user.auth_user_id,
      );
    } catch (error: any) {
      // Handle AI service errors (e.g., DeepSeek API authentication failures)
      const errorMessage = error?.message || 'Unknown error';
      
      // Check for authentication errors (401) or other API errors
      if (errorMessage.includes('401') || errorMessage.includes('Authentication') || errorMessage.includes('api key')) {
        throw new BadGatewayException(
          'AI service authentication failed. Please check the AI service API key configuration. ' +
          'Original error: ' + errorMessage
        );
      }
      
      // Check for other HTTP errors from the AI service
      if (errorMessage.includes('API error') || errorMessage.includes('error:')) {
        throw new BadGatewayException(
          'AI service error: ' + errorMessage
        );
      }
      
      // For other unexpected errors, throw as internal server error
      throw new InternalServerErrorException(
        `Failed to expand SOAP note: ${errorMessage}`
      );
    }

    // Update the SOAP note with the expanded content
    await this.supabaseService
      .getClient()
      .from('soap_notes')
      .update(result.expanded)
      .eq('id', soapNoteId);

    // Update snapshot to include soap_notes_id for easier querying
    if (result.snapshot_id) {
      await this.supabaseService
        .getClient()
        .from('soap_snapshots')
        .update({ soap_notes_id: soapNoteId })
        .eq('id', result.snapshot_id);
    }

    return {
      version_id: result.snapshot_id,
      updated_at: new Date().toISOString(),
    };
  }

  async undoSOAPExpand(soapNoteId: string, user: UserContext): Promise<any> {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Get current SOAP note data to save as snapshot before reverting
    const { data: currentSoapData } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('subjective, objective, assessment, plan')
      .eq('id', soapNoteId)
      .single();

    // Find the latest snapshot for this SOAP note
    const { data: latestSnapshot, error: snapshotError } = await this.supabaseService
      .getClient()
      .from('soap_snapshots')
      .select('*')
      .eq('soap_notes_id', soapNoteId)
      .is('undone_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError || !latestSnapshot) {
      throw new NotFoundException('No active AI expansion found to undo.');
    }

    // Revert SOAP note to snapshot data
    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .update(latestSnapshot.snapshot_data)
      .eq('id', soapNoteId);

    if (updateError) {
      throw new InternalServerErrorException(`Failed to revert SOAP note: ${updateError.message}`);
    }

    // Mark snapshot as undone
    await this.supabaseService
      .getClient()
      .from('soap_snapshots')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', latestSnapshot.id);

    return {
      reverted_version_id: latestSnapshot.id,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get public URL for base body map image
   */
  async getBaseImageUrl(species: string, user: UserContext): Promise<{ url: string }> {
    const filePath = `base-images/${species}.png`;
    const supabase = this.supabaseService.getClient();
    
    const { data: { publicUrl } } = supabase.storage
      .from('body-maps')
      .getPublicUrl(filePath);
    
    return { url: publicUrl };
  }

  /**
   * Get signed URL for base body map image
   */
  async getSignedBaseImageUrl(
    species: string,
    user: UserContext,
    expiresIn: number = 3600,
  ): Promise<{ url: string }> {
    const filePath = `base-images/${species}.png`;
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase.storage
      .from('body-maps')
      .createSignedUrl(filePath, expiresIn);
    
    if (error) {
      throw new InternalServerErrorException(`Failed to create signed URL: ${error.message}`);
    }
    
    return { url: data.signedUrl };
  }

  /**
   * List files in storage folder
   */
  async listStorageFiles(folder: string, user: UserContext): Promise<any[]> {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase.storage
      .from('body-maps')
      .list(folder);
    
    if (error) {
      throw new InternalServerErrorException(`Failed to list files: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Verify if base image exists for a species
   */
  async verifyImageExists(species: string, user: UserContext): Promise<{ exists: boolean }> {
    try {
      const supabase = this.supabaseService.getClient();
      
      const { data, error } = await supabase.storage
        .from('body-maps')
        .list('base-images', {
          search: `${species}.png`,
        });
      
      if (error) {
        // Listing may not be allowed by policies - assume it exists
        return { exists: true };
      }
      
      const exists = (data || []).some(
        (file) => file.name.toLowerCase() === `${species}.png`.toLowerCase(),
      );
      
      return { exists };
    } catch (error) {
      // Don't fail completely - assume it might exist
      return { exists: true };
    }
  }

  /**
   * Get public URL for discharge instructions file
   */
  async getDischargeInstructionsPublicUrl(
    filePath: string,
    user: UserContext,
  ): Promise<{ url: string }> {
    const supabase = this.supabaseService.getClient();
    
    const { data: { publicUrl } } = supabase.storage
      .from('discharge-instructions')
      .getPublicUrl(filePath);
    
    return { url: publicUrl };
  }

  /**
   * Upload discharge instructions file to storage
   */
  async uploadDischargeInstructionsFile(
    appointmentId: string,
    filePath: string,
    fileData: string, // base64 encoded file data
    contentType: string,
    user: UserContext,
  ): Promise<{ url: string }> {
    // Validate appointmentId is provided
    if (!appointmentId || typeof appointmentId !== 'string' || appointmentId.trim() === '') {
      throw new BadRequestException('appointmentId is required and cannot be empty');
    }

    // Validate appointment access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment with id ${appointmentId} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this appointment');
    }

    const supabase = this.supabaseService.getClient();

    // Convert base64 to buffer
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('discharge-instructions')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentType,
      });

    if (uploadError) {
      if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
        throw new BadRequestException('Bucket "discharge-instructions" does not exist. Please create it in Supabase Storage and ensure it is public.');
      }
      if (uploadError.message.includes('row-level security') || uploadError.message.includes('permission')) {
        throw new ForbiddenException(`Permission denied: ${uploadError.message}. Please check storage RLS policies.`);
      }
      throw new InternalServerErrorException(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('discharge-instructions')
      .getPublicUrl(filePath);

    return { url: publicUrl };
  }

  /**
   * Upload body map thumbnail to storage
   */
  async uploadBodyMapThumbnail(
    soapNoteId: string,
    bodyMapId: string,
    fileData: string, // base64 encoded file data
    user: UserContext,
  ): Promise<{ url: string }> {
    // Validate SOAP note access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    const supabase = this.supabaseService.getClient();
    const fileName = `${bodyMapId}.png`;
    const filePath = `annotations/${soapNoteId}/${fileName}`;

    // Convert base64 to buffer
    const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('body-maps')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });

    if (uploadError) {
      if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
        throw new BadRequestException('Bucket "body-maps" does not exist. Please create it in Supabase Storage and ensure it is public.');
      }
      if (uploadError.message.includes('row-level security') || uploadError.message.includes('permission')) {
        throw new ForbiddenException(`Permission denied: ${uploadError.message}. Please check storage RLS policies for the annotations folder.`);
      }
      throw new InternalServerErrorException(`Failed to upload thumbnail: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('body-maps')
      .getPublicUrl(filePath);

    return { url: publicUrl };
  }

  /**
   * Remove body map thumbnail from storage
   */
  async removeBodyMapThumbnail(
    filePath: string,
    user: UserContext,
  ): Promise<{ success: boolean }> {
    // Extract soap_note_id from file path to validate access
    const pathMatch = filePath.match(/annotations\/([^/]+)\//);
    if (!pathMatch || !pathMatch[1]) {
      throw new BadRequestException('Invalid file path format');
    }

    const soapNoteId = pathMatch[1];

    // Validate SOAP note access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    const supabase = this.supabaseService.getClient();
    const { error } = await supabase.storage
      .from('body-maps')
      .remove([filePath]);

    if (error) {
      throw new InternalServerErrorException(`Failed to remove thumbnail: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * Create SOAP vitals
   */
  async createSoapVitals(data: any, soapNoteId: string, user: UserContext): Promise<any> {
    // First, validate access to the SOAP note
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Create vitals
    const { data: soapVitals, error } = await this.supabaseService
      .getClient()
      .from('soap_vitals')
      .insert({
        ...data,
        soap_notes_id: soapNoteId
      })
      .select(`
        id,
        created_at,
        soap_notes_id,
        supervising_user,
        weight,
        temperature,
        heart_rate,
        respiratory_rate,
        blood_pressure,
        supervisor:users!supervising_user(id, full_name)
      `)
      .single();

    if (error) throw error;
    return soapVitals;
  }

  /**
   * Update SOAP vitals
   */
  async updateSoapVitals(id: string, data: any, user: UserContext): Promise<any> {
    // First, get the vitals to validate access
    const { data: vitals, error: vitalsError } = await this.supabaseService
      .getClient()
      .from('soap_vitals')
      .select('soap_notes_id')
      .eq('id', id)
      .single();

    if (vitalsError || !vitals) {
      throw new Error(`SOAP vitals with id ${id} not found`);
    }

    // Get SOAP note to get appointment_id
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('appointment_id')
      .eq('id', vitals.soap_notes_id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note not found for vitals ${id}`);
    }

    // Get appointment to validate clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP vitals');
    }

    // Update vitals
    const { data: updatedVitals, error } = await this.supabaseService
      .getClient()
      .from('soap_vitals')
      .update(data)
      .eq('id', id)
      .select(`
        id,
        created_at,
        soap_notes_id,
        supervising_user,
        weight,
        temperature,
        heart_rate,
        respiratory_rate,
        blood_pressure,
        supervisor:users!supervising_user(id, full_name)
      `)
      .single();

    if (error) throw error;
    return updatedVitals;
  }

  /**
   * Create SOAP physical exam
   */
  async createSoapPhysicalExam(data: any, soapNoteId: string, user: UserContext): Promise<any> {
    // First, validate access to the SOAP note
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapNoteId)
      .single();

    if (soapError || !soapNote) {
      throw new NotFoundException(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
    }

    // Create physical exam
    const { data: soapPhysical, error } = await this.supabaseService
      .getClient()
      .from('soap_physical')
      .insert({
        soap_notes_id: soapNoteId,
        supervising_user: data.supervising_user,
        exam: data,
      })
      .select(`
        id,
        created_at,
        soap_notes_id,
        supervising_user,
        title,
        template,
        exam,
        supervisor:users!supervising_user(id, full_name)
      `)
      .single();

    if (error) throw error;
    return soapPhysical;
  }

  /**
   * Update SOAP physical exam
   */
  async updateSoapPhysicalExam(id: string, data: any, user: UserContext): Promise<any> {
    // First, get the physical exam to validate access
    const { data: physical, error: physicalError } = await this.supabaseService
      .getClient()
      .from('soap_physical')
      .select('soap_notes_id')
      .eq('id', id)
      .single();

    if (physicalError || !physical) {
      throw new Error(`SOAP physical exam with id ${id} not found`);
    }

    // Get SOAP note to get appointment_id
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('appointment_id')
      .eq('id', physical.soap_notes_id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note not found for physical exam ${id}`);
    }

    // Get appointment to validate clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP physical exam');
    }

    // Update physical exam
    const { data: updatedPhysical, error } = await this.supabaseService
      .getClient()
      .from('soap_physical')
      .update({
        supervising_user: data.supervising_user,
        exam: data,
      })
      .eq('id', id)
      .select(`
        id,
        created_at,
        soap_notes_id,
        supervising_user,
        title,
        template,
        exam,
        supervisor:users!supervising_user(id, full_name)
      `)
      .single();

    if (error) throw error;
    return updatedPhysical;
  }

  /**
   * Create treatment plan
   */
  async createTreatmentPlan(data: any, user: UserContext): Promise<any> {
    // Map treatment_description to description if provided
    const treatmentPlanData: any = { ...data };
    if (treatmentPlanData.treatment_description !== undefined && treatmentPlanData.description === undefined) {
      treatmentPlanData.description = treatmentPlanData.treatment_description;
      delete treatmentPlanData.treatment_description;
    }

    // Optimize: Only fetch from SOAP note if appointment_id is not provided
    // This avoids unnecessary API calls when frontend already has appointment_id
    let appointmentIdFromSoap: string | undefined;
    if (!treatmentPlanData.appointment_id && treatmentPlanData.soap_note_id) {
      const { data: soapNote, error: soapError } = await this.supabaseService
        .getClient()
        .from('soap_notes')
        .select('appointment_id, pet_id, appointments!inner(tenant_id)')
        .eq('id', treatmentPlanData.soap_note_id)
        .single();

      if (soapError || !soapNote) {
        throw new NotFoundException(`SOAP note with id ${treatmentPlanData.soap_note_id} not found`);
      }

      const appointment = (soapNote as any).appointments;
      if (appointment?.tenant_id && user.clinic_id !== appointment.tenant_id) {
        throw new ForbiddenException('Access denied: You do not have access to this SOAP note');
      }

      // Store appointment_id and pet_id from SOAP note for later use
      appointmentIdFromSoap = soapNote.appointment_id;
      if (!treatmentPlanData.pet_id && soapNote.pet_id) {
        treatmentPlanData.pet_id = soapNote.pet_id;
      }
    }

    // Set appointment_id from SOAP note if not provided
    if (!treatmentPlanData.appointment_id && appointmentIdFromSoap) {
      treatmentPlanData.appointment_id = appointmentIdFromSoap;
    }

    // Validate appointment access if appointment_id is provided
    if (treatmentPlanData.appointment_id) {
      const { data: appointment, error: appointmentError } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select('tenant_id')
        .eq('id', treatmentPlanData.appointment_id)
        .single();

      if (appointmentError || !appointment) {
        throw new NotFoundException(`Appointment with id ${treatmentPlanData.appointment_id} not found`);
      }

      // Validate clinic access
      if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
        throw new ForbiddenException('Access denied: You do not have access to this appointment');
      }
    }

    // Set required fields if not provided
    if (!treatmentPlanData.created_by) {
      treatmentPlanData.created_by = user.user_id; // Use user.user_id (users.id) instead of user.id (auth_user_id)
    }
    if (!treatmentPlanData.clinic_id && user.clinic_id) {
      treatmentPlanData.clinic_id = user.clinic_id;
    }

    // Validate required fields
    if (!treatmentPlanData.appointment_id) {
      throw new BadRequestException('appointment_id is required. Either provide it directly or provide soap_note_id to automatically retrieve it.');
    }
    if (!treatmentPlanData.treatment_name) {
      throw new BadRequestException('treatment_name is required.');
    }
    if (!treatmentPlanData.status) {
      throw new BadRequestException('status is required.');
    }

    // Create treatment plan
    const { data: treatmentPlan, error } = await this.supabaseService
      .getClient()
      .from('treatment_plans')
      .insert(treatmentPlanData)
      .select(`
        *,
        product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
        created_by_doc:users!created_by(id, full_name)
      `)
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create treatment plan: ${error.message}`);
    }
    return treatmentPlan;
  }

  /**
   * Update treatment plan status
   */
  async updateTreatmentPlanStatus(id: string, status: string, user: UserContext): Promise<any> {
    // First, get the treatment plan to validate access
    const { data: treatmentPlan, error: treatmentError } = await this.supabaseService
      .getClient()
      .from('treatment_plans')
      .select('appointment_id, soap_note_id')
      .eq('id', id)
      .single();

    if (treatmentError || !treatmentPlan) {
      throw new NotFoundException(`Treatment plan with id ${id} not found`);
    }

    // Validate clinic access via appointment or SOAP note
    let hasAccess = false;
    
    if (treatmentPlan.appointment_id) {
      const { data: appointment, error: appointmentError } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select('tenant_id')
        .eq('id', treatmentPlan.appointment_id)
        .single();

      if (!appointmentError && appointment) {
        hasAccess = appointment.tenant_id ? user.clinic_id === appointment.tenant_id : true;
      }
    } else if (treatmentPlan.soap_note_id) {
      const { data: soapNote, error: soapError } = await this.supabaseService
        .getClient()
        .from('soap_notes')
        .select('appointment_id')
        .eq('id', treatmentPlan.soap_note_id)
        .single();

      if (!soapError && soapNote && soapNote.appointment_id) {
        const { data: appointment, error: appointmentError } = await this.supabaseService
          .getClient()
          .from('appointments')
          .select('tenant_id')
          .eq('id', soapNote.appointment_id)
          .single();

        if (!appointmentError && appointment) {
          hasAccess = appointment.tenant_id ? user.clinic_id === appointment.tenant_id : true;
        }
      }
    }

    if (!hasAccess) {
      throw new ForbiddenException('Access denied: You do not have access to this treatment plan');
    }

    // Update treatment plan
    const { data: updatedPlan, error } = await this.supabaseService
      .getClient()
      .from('treatment_plans')
      .update({ status })
      .eq('id', id)
      .select(`
        *,
        product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
        created_by_doc:users!created_by(id, full_name)
      `)
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update treatment plan status: ${error.message}`);
    }
    return updatedPlan;
  }

  /**
   * Create discharge instructions
   */
  async createDischargeInstructions(data: any, user: UserContext): Promise<any> {
    // Validate appointment_id is provided
    if (!data.appointment_id || typeof data.appointment_id !== 'string' || data.appointment_id.trim() === '') {
      throw new BadRequestException('appointment_id is required and cannot be empty');
    }

    // Validate appointment access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', data.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment with id ${data.appointment_id} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this appointment');
    }

    // Filter out invalid fields that don't exist in the table schema
    // Valid fields: appointment_id, home_care_instructions, medication_instructions, 
    // activity_restrictions, diet_recommendations, warning_signs, follow_up_needed,
    // follow_up_timeframe, follow_up_notes
    const validFields = [
      'appointment_id',
      'home_care_instructions',
      'medication_instructions',
      'activity_restrictions',
      'diet_recommendations',
      'warning_signs',
      'follow_up_needed',
      'follow_up_timeframe',
      'follow_up_notes'
    ];
    
    const filteredData: any = {};
    for (const key of validFields) {
      if (key in data) {
        filteredData[key] = data[key];
      }
    }

    // Create discharge instructions
    const { data: instructions, error } = await this.supabaseService
      .getClient()
      .from('discharge_instructions')
      .insert(filteredData)
      .select(`
        *,
        provided_by_user:users!provided_by(id, full_name)
      `)
      .single();

    if (error) throw error;
    return instructions;
  }

  /**
   * Get discharge instructions by appointment
   */
  async getDischargeInstructionsByAppointment(appointmentId: string, user: UserContext): Promise<any> {
    // Validate appointment access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new NotFoundException(`Appointment with id ${appointmentId} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this appointment');
    }

    // Get discharge instructions
    const { data, error } = await this.supabaseService
      .getClient()
      .from('discharge_instructions')
      .select(`
        *,
        provided_by_user:users!provided_by(id, full_name)
      `)
      .eq('appointment_id', appointmentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
    return data || null;
  }

  /**
   * Mark discharge instructions as provided
   */
  async markDischargeInstructionsProvided(id: string, user: UserContext): Promise<any> {
    // First, get the discharge instructions to validate access
    const { data: instructions, error: instructionsError } = await this.supabaseService
      .getClient()
      .from('discharge_instructions')
      .select('appointment_id')
      .eq('id', id)
      .single();

    if (instructionsError || !instructions) {
      throw new Error(`Discharge instructions with id ${id} not found`);
    }

    // Get appointment to validate clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', instructions.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for discharge instructions`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this discharge instructions');
    }

    // Mark as provided
    const { data: updatedInstructions, error } = await this.supabaseService
      .getClient()
      .from('discharge_instructions')
      .update({
        provided_to_client: true,
        provided_at: new Date().toISOString(),
        provided_by: user.user_id
      })
      .eq('id', id)
      .select(`
        *,
        provided_by_user:users!provided_by(id, full_name)
      `)
      .single();

    if (error) throw error;
    return updatedInstructions;
  }
}

