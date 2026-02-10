import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { AiService } from '../ai/ai.service';

@Injectable()
export class SoapService {
  constructor(
    private supabaseService: SupabaseService,
    private aiService: AiService,
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
      throw new Error(`Pet with id ${petId} not found`);
    }

    if (pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
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
      throw new Error(`Appointment with id ${appointmentId} not found`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this appointment');
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
      throw new Error(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error('Access denied: You do not have access to this appointment');
    }

    // Create SOAP note
    const { data: soapNote, error } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .insert({
        ...data,
        created_by: user.id,
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

    if (error) throw error;
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
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error(`Body map with id ${id} not found`);
    }

    // Get appointment to check clinic access
    const appointmentId = (bodyMap.soap_notes as any)?.appointment_id;
    if (!appointmentId) {
      throw new Error(`Appointment not found for body map ${id}`);
    }

    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for body map ${id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this body map');
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
      .select('id, appointment_id')
      .eq('id', data.soap_note_id)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${data.soap_note_id} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${data.soap_note_id}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
    }

    // Create body map
    const { data: bodyMap, error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create body map: ${error.message || 'Unknown error'}`);
    }

    return bodyMap;
  }

  async updateBodyMap(id: string, data: any, user: UserContext) {
    // First get the body map to validate access
    const bodyMap = await this.getBodyMapById(id, user);
    if (!bodyMap) {
      throw new Error(`Body map with id ${id} not found`);
    }

    // Update body map
    const { data: updatedBodyMap, error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update body map: ${error.message || 'Unknown error'}`);
    }

    return updatedBodyMap;
  }

  async deleteBodyMap(id: string, user: UserContext) {
    // First get the body map to validate access and get thumbnail URL
    const bodyMap = await this.getBodyMapById(id, user);
    if (!bodyMap) {
      throw new Error(`Body map with id ${id} not found`);
    }

    // Delete body map
    const { error } = await this.supabaseService
      .getClient()
      .from('soap_body_maps')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete body map: ${error.message || 'Unknown error'}`);
    }

    // Return thumbnail URL so frontend can delete it from storage
    return {
      success: true,
      thumbnail_url: (bodyMap as any).thumbnail_url,
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
      throw new Error(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
    }

    const result = await this.aiService.expandSoap(
      {
        appointment_id: appointment.id,
        section,
        current_data: currentData,
      },
      user.auth_user_id,
    );

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
      throw new Error(`SOAP note with id ${soapNoteId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapNoteId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
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
      throw new Error('No active AI expansion found to undo.');
    }

    // Revert SOAP note to snapshot data
    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .update(latestSnapshot.snapshot_data)
      .eq('id', soapNoteId);

    if (updateError) {
      throw new Error(`Failed to revert SOAP note: ${updateError.message}`);
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
}

