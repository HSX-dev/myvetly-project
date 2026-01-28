import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import {
  GetWhiteboardPatientsDto,
  AddPatientToWhiteboardDto,
  UpdateWhiteboardPatientDto,
  ScheduleTreatmentDto,
  UpdateTreatmentDto,
  CompleteTreatmentDto,
  AssignTaskDto,
  ScheduleProcedureDto,
  UpdateProcedureStatusDto,
  CreateLocationDto,
  CreateHandoverNoteDto,
  RejectInvoiceItemDto,
} from './dto/index';

@Injectable()
export class WhiteboardService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all whiteboard patients for a clinic on a given date
   * Matches original frontend logic exactly
   */
  async getWhiteboardPatients(
    clinicId: string,
    date: Date,
    filters: GetWhiteboardPatientsDto,
    user: UserContext,
  ): Promise<any[]> {
    // Validate clinic access
    if (user.role !== 'super_admin') {
      if (user.clinic_id !== clinicId) {
        throw new ForbiddenException('Access denied: Cannot access whiteboard for other clinics');
      }
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    let query = this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select(`
        *,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            users!clients_user_id_fkey(
              id,
              full_name,
              email
            )
          )
        ),
        appointments(
          id,
          reason_for_consultation,
          status
        ),
        location:whiteboard_locations(*),
        assigned_vet:users!assigned_vet_id(
          id,
          full_name
        ),
        assigned_tech:users!assigned_tech_id(
          id,
          full_name
        )
      `)
      .eq('clinic_id', clinicId)
      .neq('status', 'discharged');

    // Apply filters
    if (filters.assigned_vet_id) {
      query = query.eq('assigned_vet_id', filters.assigned_vet_id);
    }
    if (filters.assigned_tech_id) {
      query = query.eq('assigned_tech_id', filters.assigned_tech_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.location_id) {
      query = query.eq('location_id', filters.location_id);
    }

    const { data, error } = await query.order('checked_in_at', { ascending: true });

    if (error) {
      console.error('Error fetching whiteboard patients:', error);
      throw new InternalServerErrorException(`Failed to fetch whiteboard patients: ${error.message}`);
    }

    // Filter by date: show patients checked in on this date OR still active from previous days
    let filteredData = (data || []).filter((patient: any) => {
      const checkedInDate = new Date(patient.checked_in_at);
      const isCheckedInToday = checkedInDate >= startOfDay && checkedInDate <= endOfDay;
      const isActiveFromPreviousDay = checkedInDate < startOfDay && !patient.discharged_at;
      return isCheckedInToday || isActiveFromPreviousDay;
    });

    // Apply location group filter
    if (filters.location_group) {
      filteredData = filteredData.filter((patient: any) => {
        const location = patient.location;
        if (!location) return false;
        return location.type === filters.location_group;
      });
    }

    // Apply search filter if provided
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredData = filteredData.filter((patient: any) => {
        const petName = patient.pets?.name?.toLowerCase() || '';
        const ownerName = patient.pets?.clients?.users?.full_name?.toLowerCase() || '';
        const reason = patient.appointments?.reason_for_consultation?.toLowerCase() || '';
        return petName.includes(searchLower) || ownerName.includes(searchLower) || reason.includes(searchLower);
      });
    }

    // Note: Procedure type/status and overdue filters are applied client-side
    // after loading patient details with treatments, as they require treatment data

    return filteredData;
  }

  /**
   * Add patient to whiteboard
   * Matches original frontend logic exactly
   */
  async addPatientToWhiteboard(
    addPatientDto: AddPatientToWhiteboardDto,
    user: UserContext,
  ): Promise<any> {
    // Get appointment details
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('pet_id, tenant_id, organization_id, reason_for_consultation')
      .eq('id', addPatientDto.appointment_id)
      .single();

    if (appointmentError) {
      throw new NotFoundException(`Appointment with id ${addPatientDto.appointment_id} not found`);
    }

    if (!appointment.tenant_id) {
      throw new BadRequestException('Appointment does not have a clinic (tenant_id) assigned');
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== appointment.tenant_id) {
      throw new ForbiddenException('Access denied: Cannot add patient to whiteboard for other clinics');
    }

    // Get organization_id from clinic if not in appointment
    let organizationId = appointment.organization_id;
    if (!organizationId) {
      const { data: clinic } = await this.supabaseService
        .getClient()
        .from('clinics')
        .select('organization_id')
        .eq('id', appointment.tenant_id)
        .single();
      organizationId = clinic?.organization_id;
    }

    // Check if patient already on whiteboard
    const { data: existing } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('id')
      .eq('appointment_id', addPatientDto.appointment_id)
      .neq('status', 'discharged')
      .maybeSingle();

    if (existing) {
      throw new BadRequestException('Patient is already on the whiteboard');
    }

    const insertData = {
      appointment_id: addPatientDto.appointment_id,
      pet_id: appointment.pet_id,
      clinic_id: appointment.tenant_id,
      organization_id: organizationId || user.organization_id,
      location_id: addPatientDto.location_id,
      assigned_vet_id: addPatientDto.assigned_vet_id,
      assigned_tech_id: addPatientDto.assigned_tech_id,
      priority: addPatientDto.priority || 'medium',
      notes: addPatientDto.notes,
      status: 'waiting' as const,
      checked_in_at: new Date().toISOString(),
    };

    const { data: whiteboardPatient, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .insert(insertData)
      .select(`
        *,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            users!clients_user_id_fkey(
              id,
              full_name,
              email
            )
          )
        ),
        appointments(
          id,
          reason_for_consultation,
          status
        ),
        location:whiteboard_locations(*),
        assigned_vet:users!assigned_vet_id(
          id,
          full_name
        ),
        assigned_tech:users!assigned_tech_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error adding patient to whiteboard:', error);
      throw new InternalServerErrorException(`Failed to add patient to whiteboard: ${error.message}`);
    }

    // Update appointment status to checked_in
    await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
      .eq('id', addPatientDto.appointment_id);

    // Log audit entry
    await this.logAuditEntry(
      whiteboardPatient.id,
      'patient_added',
      undefined,
      whiteboardPatient,
      'Patient added to whiteboard',
      user,
    );

    return whiteboardPatient;
  }

  /**
   * Update whiteboard patient
   * Matches original frontend logic exactly
   */
  async updateWhiteboardPatient(
    patientId: string,
    updateDto: UpdateWhiteboardPatientDto,
    user: UserContext,
  ): Promise<any> {
    // Get current state for audit log
    const { data: currentPatient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (!currentPatient) {
      throw new NotFoundException(`Whiteboard patient with id ${patientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== currentPatient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot update whiteboard patient for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .update(updateDto)
      .eq('id', patientId)
      .select(`
        *,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            users!clients_user_id_fkey(
              id,
              full_name,
              email
            )
          )
        ),
        appointments(
          id,
          reason_for_consultation,
          status
        ),
        location:whiteboard_locations(*),
        assigned_vet:users!assigned_vet_id(
          id,
          full_name
        ),
        assigned_tech:users!assigned_tech_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating whiteboard patient:', error);
      throw new InternalServerErrorException(`Failed to update whiteboard patient: ${error.message}`);
    }

    // Log audit entry
    await this.logAuditEntry(
      patientId,
      'patient_updated',
      currentPatient,
      data,
      'Whiteboard patient updated',
      user,
    );

    return data;
  }

  /**
   * Remove/discharge patient from whiteboard
   * Matches original frontend logic exactly
   */
  async removePatientFromWhiteboard(patientId: string, user: UserContext): Promise<void> {
    // Get current state for audit log
    const { data: currentPatient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (!currentPatient) {
      throw new NotFoundException(`Whiteboard patient with id ${patientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== currentPatient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot remove whiteboard patient for other clinics');
    }

    const { data: updatedPatient, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .update({
        status: 'discharged',
        discharged_at: new Date().toISOString(),
      })
      .eq('id', patientId)
      .select()
      .single();

    if (error) {
      console.error('Error removing patient from whiteboard:', error);
      throw new InternalServerErrorException(`Failed to remove patient from whiteboard: ${error.message}`);
    }

    // Log audit entry
    await this.logAuditEntry(
      patientId,
      'patient_discharged',
      currentPatient,
      updatedPatient,
      'Patient discharged from whiteboard',
      user,
    );
  }

  /**
   * Get full patient details with treatments and tasks
   * Matches original frontend logic exactly
   */
  async getPatientDetails(whiteboardPatientId: string, user: UserContext): Promise<any> {
    const { data: patient, error: patientError } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select(`
        *,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            users!clients_user_id_fkey(
              id,
              full_name,
              email
            )
          )
        ),
        appointments(
          id,
          reason_for_consultation,
          status
        ),
        location:whiteboard_locations(*),
        assigned_vet:users!assigned_vet_id(
          id,
          full_name
        ),
        assigned_tech:users!assigned_tech_id(
          id,
          full_name
        )
      `)
      .eq('id', whiteboardPatientId)
      .single();

    if (patientError) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot access whiteboard patient for other clinics');
    }

    // Get treatments
    const { data: treatments, error: treatmentsError } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patient_id', whiteboardPatientId)
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    if (treatmentsError) {
      console.error('Error fetching treatments:', treatmentsError);
      throw new InternalServerErrorException(`Failed to fetch treatments: ${treatmentsError.message}`);
    }

    // Get tasks
    const { data: tasks, error: tasksError } = await this.supabaseService
      .getClient()
      .from('whiteboard_tasks')
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patient_id', whiteboardPatientId)
      .order('scheduled_time', { ascending: true });

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      throw new InternalServerErrorException(`Failed to fetch tasks: ${tasksError.message}`);
    }

    return {
      ...patient,
      treatments: treatments || [],
      tasks: tasks || [],
    };
  }

  /**
   * Schedule treatment
   * Matches original frontend logic exactly
   */
  async scheduleTreatment(
    whiteboardPatientId: string,
    scheduleTreatmentDto: ScheduleTreatmentDto,
    user: UserContext,
  ): Promise<any> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot schedule treatment for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .insert({
        whiteboard_patient_id: whiteboardPatientId,
        ...scheduleTreatmentDto,
      })
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error scheduling treatment:', error);
      throw new InternalServerErrorException(`Failed to schedule treatment: ${error.message}`);
    }

    return data;
  }

  /**
   * Update treatment
   * Matches original frontend logic exactly
   */
  async updateTreatment(
    treatmentId: string,
    updateTreatmentDto: UpdateTreatmentDto,
    user: UserContext,
  ): Promise<any> {
    // Get current treatment for audit log
    const { data: currentTreatment, error: currentError } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select('*, whiteboard_patients!inner(clinic_id)')
      .eq('id', treatmentId)
      .single();

    if (currentError || !currentTreatment) {
      throw new NotFoundException(`Treatment with id ${treatmentId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(currentTreatment.whiteboard_patients)
      ? currentTreatment.whiteboard_patients[0]
      : currentTreatment.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot update treatment for other clinics');
    }

    // Update treatment
    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .update({
        ...updateTreatmentDto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', treatmentId)
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating treatment:', error);
      throw new InternalServerErrorException(`Failed to update treatment: ${error.message}`);
    }

    // Log audit entry
    await this.logAuditEntry(
      currentTreatment.whiteboard_patient_id,
      'treatment_updated',
      currentTreatment,
      data,
      `Treatment updated: ${updateTreatmentDto.treatment_name || currentTreatment.treatment_name}`,
      user,
    );

    return data;
  }

  /**
   * Complete treatment
   * Matches original frontend logic exactly
   */
  async completeTreatment(
    treatmentId: string,
    completeTreatmentDto: CompleteTreatmentDto,
    user: UserContext,
  ): Promise<void> {
    // Get treatment details to check if it has a treatment_plan_id
    const { data: treatment, error: treatmentError } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select(`
        *,
        whiteboard_patients!inner(
          id,
          appointment_id,
          clinic_id
        ),
        treatment_plans(
          id,
          service_id
        )
      `)
      .eq('id', treatmentId)
      .single();

    if (treatmentError || !treatment) {
      throw new NotFoundException(`Treatment with id ${treatmentId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(treatment.whiteboard_patients)
      ? treatment.whiteboard_patients[0]
      : treatment.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot complete treatment for other clinics');
    }

    // Update treatment status
    const updateData: any = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (completeTreatmentDto.notes) {
      updateData.notes = completeTreatmentDto.notes;
    }

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .update(updateData)
      .eq('id', treatmentId);

    if (updateError) {
      console.error('Error completing treatment:', updateError);
      throw new InternalServerErrorException(`Failed to complete treatment: ${updateError.message}`);
    }

    // Create pending invoice item if treatment has a treatment_plan_id
    if (treatment.treatment_plan_id && treatment.treatment_plans) {
      const treatmentPlan = Array.isArray(treatment.treatment_plans)
        ? treatment.treatment_plans[0]
        : treatment.treatment_plans;

      if (treatmentPlan?.service_id) {
        // Get service price
        const { data: service, error: serviceError } = await this.supabaseService
          .getClient()
          .from('clinic_services')
          .select('id, price')
          .eq('id', treatmentPlan.service_id)
          .single();

        if (!serviceError && service) {
          // Create pending invoice item
          await this.supabaseService
            .getClient()
            .from('whiteboard_pending_invoice_items')
            .insert({
              whiteboard_treatment_id: treatmentId,
              whiteboard_patient_id: patient.id,
              appointment_id: patient.appointment_id,
              service_id: treatmentPlan.service_id,
              status: 'pending_review',
              price: service.price || 0,
              notes: completeTreatmentDto.notes,
            });
        }
      }
    }
  }

  /**
   * Get treatments due now/soon
   * Matches original frontend logic exactly
   */
  async getDueTreatments(
    clinicId: string,
    date: Date,
    assignedToUserId: string | undefined,
    user: UserContext,
  ): Promise<any[]> {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot access treatments for other clinics');
    }

    const now = new Date();
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    let query = this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select(`
        *,
        whiteboard_patients!inner(
          id,
          clinic_id,
          pets(
            id,
            name
          )
        ),
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patients.clinic_id', clinicId)
      .in('status', ['STAT', 'PRN', 'scheduled'])
      .neq('status', 'completed')
      .lte('scheduled_time', endOfDay.toISOString());

    if (assignedToUserId) {
      query = query.eq('assigned_to_user_id', assignedToUserId);
    }

    const { data, error } = await query.order('scheduled_time', { ascending: true });

    if (error) {
      console.error('Error getting due treatments:', error);
      throw new InternalServerErrorException(`Failed to get due treatments: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get overdue treatments
   * Matches original frontend logic exactly
   */
  async getOverdueTreatments(
    clinicId: string,
    date: Date,
    assignedToUserId: string | undefined,
    user: UserContext,
  ): Promise<any[]> {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot access treatments for other clinics');
    }

    const now = new Date();

    let query = this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select(`
        *,
        whiteboard_patients!inner(
          id,
          clinic_id,
          pets(
            id,
            name
          )
        ),
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patients.clinic_id', clinicId)
      .in('status', ['STAT', 'PRN', 'scheduled'])
      .neq('status', 'completed')
      .lt('scheduled_time', now.toISOString());

    if (assignedToUserId) {
      query = query.eq('assigned_to_user_id', assignedToUserId);
    }

    const { data, error } = await query.order('scheduled_time', { ascending: true });

    if (error) {
      console.error('Error getting overdue treatments:', error);
      throw new InternalServerErrorException(`Failed to get overdue treatments: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Assign task
   * Matches original frontend logic exactly
   */
  async assignTask(
    whiteboardPatientId: string,
    assignTaskDto: AssignTaskDto,
    user: UserContext,
  ): Promise<any> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot assign task for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_tasks')
      .insert({
        whiteboard_patient_id: whiteboardPatientId,
        ...assignTaskDto,
        status: 'pending',
      })
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error assigning task:', error);
      throw new InternalServerErrorException(`Failed to assign task: ${error.message}`);
    }

    return data;
  }

  /**
   * Complete task
   * Matches original frontend logic exactly
   */
  async completeTask(taskId: string, user: UserContext): Promise<void> {
    // Verify task exists and user has access
    const { data: task } = await this.supabaseService
      .getClient()
      .from('whiteboard_tasks')
      .select('whiteboard_patients!inner(clinic_id)')
      .eq('id', taskId)
      .single();

    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(task.whiteboard_patients)
      ? task.whiteboard_patients[0]
      : task.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot complete task for other clinics');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('whiteboard_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      console.error('Error completing task:', error);
      throw new InternalServerErrorException(`Failed to complete task: ${error.message}`);
    }
  }

  /**
   * Get whiteboard locations
   * Matches original frontend logic exactly
   */
  async getWhiteboardLocations(clinicId: string, user: UserContext): Promise<any[]> {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot access locations for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_locations')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error getting whiteboard locations:', error);
      throw new InternalServerErrorException(`Failed to get whiteboard locations: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create location
   * Matches original frontend logic exactly
   */
  async createLocation(clinicId: string, createLocationDto: CreateLocationDto, user: UserContext): Promise<any> {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot create location for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_locations')
      .insert({
        clinic_id: clinicId,
        ...createLocationDto,
        capacity: createLocationDto.capacity || 1,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating location:', error);
      throw new InternalServerErrorException(`Failed to create location: ${error.message}`);
    }

    return data;
  }

  /**
   * Get audit log
   * Matches original frontend logic exactly
   */
  async getAuditLog(whiteboardPatientId: string, user: UserContext): Promise<any[]> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot access audit log for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_audit_log')
      .select(`
        *,
        changed_by:users!changed_by_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patient_id', whiteboardPatientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting audit log:', error);
      throw new InternalServerErrorException(`Failed to get audit log: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Schedule procedure
   * Matches original frontend logic exactly
   */
  async scheduleProcedure(
    whiteboardPatientId: string,
    scheduleProcedureDto: ScheduleProcedureDto,
    user: UserContext,
  ): Promise<any> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot schedule procedure for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .insert({
        whiteboard_patient_id: whiteboardPatientId,
        ...scheduleProcedureDto,
        is_procedure: true,
        procedure_status: 'ready',
        status: 'scheduled',
      })
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error scheduling procedure:', error);
      throw new InternalServerErrorException(`Failed to schedule procedure: ${error.message}`);
    }

    return data;
  }

  /**
   * Update procedure status
   * Matches original frontend logic exactly
   */
  async updateProcedureStatus(
    treatmentId: string,
    updateProcedureStatusDto: UpdateProcedureStatusDto,
    user: UserContext,
  ): Promise<any> {
    // Get current treatment
    const { data: currentTreatment } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .select('*, whiteboard_patients!inner(clinic_id)')
      .eq('id', treatmentId)
      .single();

    if (!currentTreatment) {
      throw new NotFoundException(`Treatment with id ${treatmentId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(currentTreatment.whiteboard_patients)
      ? currentTreatment.whiteboard_patients[0]
      : currentTreatment.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot update procedure status for other clinics');
    }

    const updateData: any = {
      procedure_status: updateProcedureStatusDto.procedure_status,
    };

    // If completing procedure, also update treatment status
    if (updateProcedureStatusDto.procedure_status === 'completed') {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    }

    if (updateProcedureStatusDto.notes) {
      updateData.notes = updateProcedureStatusDto.notes;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_treatments')
      .update(updateData)
      .eq('id', treatmentId)
      .select(`
        *,
        assigned_to:users!assigned_to_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating procedure status:', error);
      throw new InternalServerErrorException(`Failed to update procedure status: ${error.message}`);
    }

    // If completing, trigger invoice item creation
    if (updateProcedureStatusDto.procedure_status === 'completed') {
      await this.completeTreatment(treatmentId, { notes: updateProcedureStatusDto.notes }, user);
    }

    return data;
  }

  /**
   * Get pending invoice items
   * Matches original frontend logic exactly
   */
  async getPendingInvoiceItems(clinicId: string, appointmentId: string | undefined, user: UserContext): Promise<any[]> {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot access invoice items for other clinics');
    }

    let query = this.supabaseService
      .getClient()
      .from('whiteboard_pending_invoice_items')
      .select(`
        *,
        whiteboard_treatments(
          id,
          treatment_name,
          completed_at
        ),
        whiteboard_patients!inner(
          id,
          clinic_id,
          pets(
            id,
            name
          ),
          appointments(
            id,
            reason_for_consultation
          )
        ),
        service:clinic_services(
          id,
          service_name,
          price
        ),
        approved_by:users!approved_by_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patients.clinic_id', clinicId)
      .eq('status', 'pending_review');

    if (appointmentId) {
      query = query.eq('appointment_id', appointmentId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting pending invoice items:', error);
      throw new InternalServerErrorException(`Failed to get pending invoice items: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Approve invoice item
   * Matches original frontend logic exactly
   */
  async approveInvoiceItem(itemId: string, user: UserContext): Promise<void> {
    // Verify item exists and user has access
    const { data: item } = await this.supabaseService
      .getClient()
      .from('whiteboard_pending_invoice_items')
      .select('whiteboard_patients!inner(clinic_id)')
      .eq('id', itemId)
      .single();

    if (!item) {
      throw new NotFoundException(`Invoice item with id ${itemId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(item.whiteboard_patients)
      ? item.whiteboard_patients[0]
      : item.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot approve invoice item for other clinics');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('whiteboard_pending_invoice_items')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by_user_id: user.user_id,
      })
      .eq('id', itemId);

    if (error) {
      console.error('Error approving invoice item:', error);
      throw new InternalServerErrorException(`Failed to approve invoice item: ${error.message}`);
    }
  }

  /**
   * Reject invoice item
   * Matches original frontend logic exactly
   */
  async rejectInvoiceItem(itemId: string, rejectInvoiceItemDto: RejectInvoiceItemDto, user: UserContext): Promise<void> {
    // Verify item exists and user has access
    const { data: item } = await this.supabaseService
      .getClient()
      .from('whiteboard_pending_invoice_items')
      .select('whiteboard_patients!inner(clinic_id)')
      .eq('id', itemId)
      .single();

    if (!item) {
      throw new NotFoundException(`Invoice item with id ${itemId} not found`);
    }

    // Validate clinic access
    const patient = Array.isArray(item.whiteboard_patients)
      ? item.whiteboard_patients[0]
      : item.whiteboard_patients;
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot reject invoice item for other clinics');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('whiteboard_pending_invoice_items')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by_user_id: user.user_id,
        rejection_reason: rejectInvoiceItemDto.reason,
      })
      .eq('id', itemId);

    if (error) {
      console.error('Error rejecting invoice item:', error);
      throw new InternalServerErrorException(`Failed to reject invoice item: ${error.message}`);
    }
  }

  /**
   * Create handover note
   * Matches original frontend logic exactly
   */
  async createHandoverNote(
    whiteboardPatientId: string,
    createHandoverNoteDto: CreateHandoverNoteDto,
    user: UserContext,
  ): Promise<any> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot create handover note for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('whiteboard_handover_notes')
      .insert({
        whiteboard_patient_id: whiteboardPatientId,
        ...createHandoverNoteDto,
        created_by_user_id: user.user_id,
        shift_date: createHandoverNoteDto.shift_date || new Date().toISOString().split('T')[0],
      })
      .select(`
        *,
        created_by:users!created_by_user_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      console.error('Error creating handover note:', error);
      throw new InternalServerErrorException(`Failed to create handover note: ${error.message}`);
    }

    return data;
  }

  /**
   * Get handover notes
   * Matches original frontend logic exactly
   */
  async getHandoverNotes(
    whiteboardPatientId: string,
    shiftDate: string | undefined,
    shiftType: 'AM' | 'PM' | 'Night' | undefined,
    user: UserContext,
  ): Promise<any[]> {
    // Verify patient exists and user has access
    const { data: patient } = await this.supabaseService
      .getClient()
      .from('whiteboard_patients')
      .select('clinic_id')
      .eq('id', whiteboardPatientId)
      .single();

    if (!patient) {
      throw new NotFoundException(`Whiteboard patient with id ${whiteboardPatientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== patient.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot access handover notes for other clinics');
    }

    let query = this.supabaseService
      .getClient()
      .from('whiteboard_handover_notes')
      .select(`
        *,
        created_by:users!created_by_user_id(
          id,
          full_name
        )
      `)
      .eq('whiteboard_patient_id', whiteboardPatientId)
      .order('created_at', { ascending: false });

    if (shiftDate) {
      query = query.eq('shift_date', shiftDate);
    }

    if (shiftType) {
      query = query.eq('shift_type', shiftType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting handover notes:', error);
      throw new InternalServerErrorException(`Failed to get handover notes: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Log audit entry (private helper method)
   * Matches original frontend logic exactly
   */
  private async logAuditEntry(
    whiteboardPatientId: string,
    action: string,
    oldValue: any,
    newValue: any,
    description: string,
    user: UserContext,
  ): Promise<void> {
    try {
      await this.supabaseService.getClient().from('whiteboard_audit_log').insert({
        whiteboard_patient_id: whiteboardPatientId,
        action,
        changed_by_user_id: user.user_id,
        old_value: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        new_value: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
        description,
      });
    } catch (error) {
      console.error('Error logging audit entry:', error);
      // Don't throw - audit logging shouldn't break the main operation
    }
  }
}


