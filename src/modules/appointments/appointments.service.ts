import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateAppointmentDto, UpdateAppointmentDto, SendConfirmationEmailDto } from './dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class AppointmentsService {
  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  /**
   * Get all appointments (admin only)
   */
  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        *,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            phone,
            users!user_id(
              id,
              full_name,
              email
            )
          )
        ),
        users!vet_id(
          id,
          full_name
        )
      `)
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Get a single appointment by ID with full relations
   */
  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        payment_status,
        payment_reference,
        booking_reference,
        symptoms,
        notes,
        client_notes,
        reason_for_consultation,
        estimated_duration,
        emergency_level,
        is_telehealth,
        created_at,
        updated_at,
        pet_id,
        client_id,
        vet_id,
        tenant_id,
        zoom_meeting_id,
        zoom_join_url,
        zoom_start_url,
        zoom_password,
        zoom_meeting_status,
        google_calendar_event_id,
        google_calendar_id,
        google_meet_url,
        google_meet_conference_id,
        pets(
          id,
          name,
          species,
          breed,
          birth_date,
          weight,
          gender,
          allergies,
          clients(
            id,
            phone,
            users!user_id(
              id,
              full_name,
              email
            )
          )
        ),
        users!vet_id(
          id,
          full_name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Appointment with id ${id} not found`);
      }
      throw error;
    }
    return data;
  }

  /**
   * Get appointments by status for a clinic
   */
  async findByStatus(
    clinicId: string,
    status: 'requested' | 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
  ) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select(`
          id,
          appointment_time,
          service_type,
          status,
          payment_status,
          payment_reference,
          booking_reference,
          symptoms,
          notes,
          client_notes,
          reason_for_consultation,
          estimated_duration,
          emergency_level,
          is_telehealth,
          created_at,
          updated_at,
          pet_id,
          client_id,
          vet_id,
          tenant_id,
          zoom_meeting_id,
          zoom_join_url,
          zoom_start_url,
          zoom_password,
          zoom_meeting_status,
          google_calendar_event_id,
          google_calendar_id,
          google_meet_url,
          google_meet_conference_id,
          pets(
            id,
            name,
            species,
            breed,
            birth_date,
            weight,
            gender,
            allergies,
            clients(
              id,
              phone,
              users!user_id(
                id,
                full_name,
                email
              )
            )
          ),
          users!vet_id(
            id,
            full_name
          )
        `)
        .eq('tenant_id', clinicId)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`Error fetching appointments by status for clinic ${clinicId}:`, error);
        throw new InternalServerErrorException(
          `Failed to fetch appointments: ${error.message || 'Unknown error'}`,
        );
      }
      return data || [];
    } catch (error) {
      console.error('Error in findByStatus:', error);
      if (error instanceof InternalServerErrorException || error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch appointments by status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get all appointments for a clinic
   */
  async findByClinic(clinicId: string, startDate?: string, endDate?: string) {
    try {
      let query = this.supabaseService
        .getClient()
        .from('appointments')
        .select(`
          id,
          appointment_time,
          service_type,
          status,
          payment_status,
          payment_reference,
          booking_reference,
          symptoms,
          notes,
          client_notes,
          reason_for_consultation,
          estimated_duration,
          emergency_level,
          is_telehealth,
          created_at,
          updated_at,
          pet_id,
          client_id,
          vet_id,
          tenant_id,
          zoom_meeting_id,
          zoom_join_url,
          zoom_start_url,
          zoom_password,
          zoom_meeting_status,
          google_calendar_event_id,
          google_calendar_id,
          google_meet_url,
          google_meet_conference_id,
          pets(
            id,
            name,
            species,
            breed,
            clients(
              id,
              phone,
              users!user_id(
                id,
                full_name,
                email
              )
            )
          ),
          users!vet_id(
            id,
            full_name
          )
        `)
        .eq('tenant_id', clinicId);

      if (startDate) {
        query = query.gte('appointment_time', startDate);
      }
      if (endDate) {
        query = query.lte('appointment_time', endDate);
      }

      const { data, error } = await query.order('appointment_time', {
        ascending: true,
      });

      if (error) {
        console.error('Error fetching appointments by clinic:', error);
        throw new InternalServerErrorException(
          `Failed to fetch appointments: ${error.message || 'Unknown error'}`,
        );
      }
      return data || [];
    } catch (error) {
      console.error('Error in findByClinic:', error);
      if (error instanceof InternalServerErrorException || error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch appointments: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Create a new appointment with conflict checking
   */
  async create(createAppointmentDto: CreateAppointmentDto, user: UserContext) {
    try {
      // Validate appointment time is in the future
      const appointmentDate = new Date(createAppointmentDto.appointment_time);
      const now = new Date();
      const minFutureTime = new Date(now.getTime() + 60000); // 1 minute buffer for clock differences
      
      if (appointmentDate < minFutureTime) {
        throw new BadRequestException(
          'Appointment time must be in the future. Cannot create appointments in the past.'
        );
      }

      // Check for conflicting appointments if vet_id is provided
      if (createAppointmentDto.vet_id) {
        const appointmentStart = new Date(createAppointmentDto.appointment_time);
        const appointmentEnd = new Date(appointmentStart);
        appointmentEnd.setMinutes(
          appointmentEnd.getMinutes() + (createAppointmentDto.estimated_duration || 30),
        );

        const { data: conflictingAppointments, error: checkError } =
          await this.supabaseService
            .getClient()
            .from('appointments')
            .select('id, appointment_time, status, vet_id, estimated_duration')
            .eq('vet_id', createAppointmentDto.vet_id)
            .in('status', ['requested', 'scheduled', 'checked_in', 'in_progress']);

        if (checkError) {
          throw new BadRequestException(
            'Unable to verify time slot availability. Please try again.',
          );
        }

        if (conflictingAppointments && conflictingAppointments.length > 0) {
          const hasConflict = conflictingAppointments.some((apt: any) => {
            const aptStart = new Date(apt.appointment_time);
            const aptEnd = new Date(aptStart);
            aptEnd.setMinutes(aptEnd.getMinutes() + (apt.estimated_duration || 30));

            return (
              appointmentStart.getTime() < aptEnd.getTime() &&
              appointmentEnd.getTime() > aptStart.getTime()
            );
          });

          if (hasConflict) {
            throw new BadRequestException(
              'This time slot is no longer available. Please select a different time.',
            );
          }
        }
      }

      // Check if this is a telehealth appointment
      const isTelehealth = this.isTelehealthAppointment(createAppointmentDto.service_type);
      const isBlockAppointment = createAppointmentDto.service_type === 'Block';

      // Build insert data
      const insertData: any = {
        tenant_id: createAppointmentDto.clinic_id, // Use tenant_id for clinic reference
        appointment_time: createAppointmentDto.appointment_time,
        service_type: createAppointmentDto.service_type,
        status: createAppointmentDto.status || 'scheduled',
        symptoms: createAppointmentDto.symptoms,
        notes: createAppointmentDto.notes,
        client_notes: createAppointmentDto.client_notes,
        reason_for_consultation: createAppointmentDto.reason_for_consultation,
        estimated_duration: createAppointmentDto.estimated_duration || 30,
        emergency_level: createAppointmentDto.emergency_level || 'low',
        is_telehealth: isTelehealth,
        booking_reference: createAppointmentDto.booking_reference,
        payment_status: createAppointmentDto.payment_status,
        payment_reference: createAppointmentDto.payment_reference,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Only include vet_id if provided and validate it exists
      if (createAppointmentDto.vet_id) {
        // Validate that the vet exists in the users table
        const { data: vet, error: vetError } = await this.supabaseService
          .getClient()
          .from('users')
          .select('id')
          .eq('id', createAppointmentDto.vet_id)
          .single();

        if (vetError || !vet) {
          throw new BadRequestException(
            `Invalid vet_id: The veterinarian with ID ${createAppointmentDto.vet_id} does not exist in the system.`
          );
        }
        insertData.vet_id = createAppointmentDto.vet_id;
      }

      // Only add client_id and pet_id if not a Block appointment
      if (!isBlockAppointment) {
        if (createAppointmentDto.client_id) {
          insertData.client_id = createAppointmentDto.client_id;
        }
        if (createAppointmentDto.pet_id) {
          insertData.pet_id = createAppointmentDto.pet_id;
        }
      }

      // Remove undefined/null values
      Object.keys(insertData).forEach((key) => {
        if (insertData[key] === undefined || insertData[key] === null) {
          delete insertData[key];
        }
      });

      const { data, error } = await this.supabaseService
        .getWriteClient(user.access_token)
        .from('appointments')
        .insert([insertData])
        .select(`
          id,
          appointment_time,
          service_type,
          status,
          payment_status,
          payment_reference,
          booking_reference,
          symptoms,
          notes,
          estimated_duration,
          emergency_level,
          created_at,
          updated_at,
          pet_id,
          client_id,
          vet_id,
          pets(
            id,
            name,
            species,
            breed,
            clients(
              id,
              phone,
              users!user_id(
                id,
                full_name,
                email
              )
            )
          ),
          users!vet_id(
            id,
            full_name
          )
        `)
        .single();

      if (error) {
        console.error('Supabase error creating appointment:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        
        // Handle specific database errors
        if (error.code === '23503') {
          // Foreign key violation
          const detail = error.details || error.message || 'Referenced record does not exist';
          throw new BadRequestException(
            `Invalid reference: ${detail}. Please check that the client, pet, vet, or clinic IDs are valid.`
          );
        }
        
        if (error.code === '23505') {
          // Unique constraint violation
          const detail = error.details || error.message || '';
          
          // Check if it's a vet_id + appointment_time conflict
          if (detail.includes('vet_id') && detail.includes('appointment_time')) {
            throw new BadRequestException(
              'This time slot is already booked for this veterinarian. Please select a different time.'
            );
          }
          
          // Check if it's a general duplicate entry
          if (detail.includes('already exists')) {
            throw new BadRequestException(
              'This appointment already exists. Please check the appointment details and try again.'
            );
          }
          
          // Generic constraint violation message
          throw new BadRequestException(
            'Unable to create appointment: This appointment conflicts with an existing record. Please check the details and try again.'
          );
        }
        
        if (error.code === '23514') {
          // Check constraint violation
          throw new BadRequestException(
            `Invalid appointment data: ${error.message || 'Data violates database constraints'}.`
          );
        }
        
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Appointment not found after creation');
        }
        
        // Generic error handling
        throw new InternalServerErrorException(
          `Failed to create appointment: ${error.message || 'Unknown database error'}`
        );
      }
      
      return data;
    } catch (error) {
      // Re-throw HTTP exceptions as-is
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof InternalServerErrorException) {
        console.error('HTTP Exception thrown:', error.message);
        throw error;
      }
      
      // Handle unexpected errors
      console.error('Unexpected error creating appointment:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error type:', error?.constructor?.name);
      throw new InternalServerErrorException(
        `Failed to create appointment: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    }
  }

  /**
   * Update an existing appointment
   */
  async update(id: string, updateAppointmentDto: UpdateAppointmentDto, user: UserContext) {
    try {
      // Validate appointment time is in the future if provided
      if (updateAppointmentDto.appointment_time) {
        const appointmentDate = new Date(updateAppointmentDto.appointment_time);
        const now = new Date();
        const minFutureTime = new Date(now.getTime() + 60000); // 1 minute buffer for clock differences
        
        if (appointmentDate < minFutureTime) {
          throw new BadRequestException(
            'Appointment time must be in the future. Cannot update appointments to past times.'
          );
        }
      }

      // Validate foreign keys if provided
      if (updateAppointmentDto.vet_id) {
        const { data: vetExists, error: vetError } = await this.supabaseService
          .getClient()
          .from('users')
          .select('id')
          .eq('id', updateAppointmentDto.vet_id)
          .single();

        if (vetError || !vetExists) {
          throw new BadRequestException(
            `Invalid reference: Key (vet_id)=(${updateAppointmentDto.vet_id}) is not present in table "users". Please check that the vet ID is valid.`
          );
        }
      }

      if (updateAppointmentDto.client_id) {
        const { data: clientExists, error: clientError } = await this.supabaseService
          .getClient()
          .from('clients')
          .select('id')
          .eq('id', updateAppointmentDto.client_id)
          .single();

        if (clientError || !clientExists) {
          throw new BadRequestException(
            `Invalid reference: Key (client_id)=(${updateAppointmentDto.client_id}) is not present in table "clients". Please check that the client ID is valid.`
          );
        }
      }

      if (updateAppointmentDto.pet_id) {
        const { data: petExists, error: petError } = await this.supabaseService
          .getClient()
          .from('pets')
          .select('id')
          .eq('id', updateAppointmentDto.pet_id)
          .single();

        if (petError || !petExists) {
          throw new BadRequestException(
            `Invalid reference: Key (pet_id)=(${updateAppointmentDto.pet_id}) is not present in table "pets". Please check that the pet ID is valid.`
          );
        }
      }

      // Check if appointment exists
      const existingAppointment = await this.findOne(id);
      if (!existingAppointment) {
        throw new NotFoundException(`Appointment with id ${id} not found`);
      }

      const updateData: any = {
        ...updateAppointmentDto,
        updated_at: new Date().toISOString(),
      };

      // Remove undefined/null values
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined || updateData[key] === null) {
          delete updateData[key];
        }
      });

      const { data, error } = await this.supabaseService
        .getWriteClient(user.access_token)
        .from('appointments')
        .update(updateData)
        .eq('id', id)
        .select(`
          id,
          appointment_time,
          service_type,
          status,
          payment_status,
          payment_reference,
          booking_reference,
          symptoms,
          notes,
          estimated_duration,
          emergency_level,
          created_at,
          updated_at,
          pet_id,
          client_id,
          vet_id,
          pets(
            id,
            name,
            species,
            breed,
            clients(
              id,
              phone,
              users!user_id(
                id,
                full_name,
                email
              )
            )
          ),
          users!vet_id(
            id,
            full_name
          )
        `)
        .single();

      if (error) {
        // Handle PostgrestError
        if (error.code === 'PGRST116') {
          throw new NotFoundException(`Appointment with id ${id} not found`);
        }

        // Handle foreign key violations
        if (error.code === '23503') {
          const detail = error.details || error.message || 'Referenced record does not exist';
          throw new BadRequestException(
            `Invalid reference: ${detail}. Please check that the client, pet, vet, or clinic IDs are valid.`
          );
        }

        // Handle constraint violations (unique constraints)
        if (error.code === '23505') {
          const detail = error.details || error.message || '';
          
          // Check if it's a vet_id + appointment_time conflict
          if (detail.includes('vet_id') && detail.includes('appointment_time')) {
            throw new BadRequestException(
              'This time slot is already booked for this veterinarian. Please select a different time.'
            );
          }
          
          // Check if it's a general duplicate entry
          if (detail.includes('already exists')) {
            throw new BadRequestException(
              'This appointment already exists. Please check the appointment details and try again.'
            );
          }
          
          // Generic constraint violation message
          throw new BadRequestException(
            'Unable to update appointment: This appointment conflicts with an existing record. Please check the details and try again.'
          );
        }

        // Handle other database errors
        if (error.code && error.code.startsWith('23')) {
          const detail = error.details || error.message || 'Database constraint violation';
          throw new BadRequestException(`Database error: ${detail}`);
        }

        // Generic Supabase error
        throw new InternalServerErrorException(
          `Failed to update appointment: ${error.message || 'Unknown database error'}`
        );
      }

      return data;
    } catch (error) {
      // Re-throw HTTP exceptions as-is
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof InternalServerErrorException) {
        throw error;
      }
      
      // Handle unexpected errors
      console.error('Unexpected error updating appointment:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error type:', error?.constructor?.name);
      throw new InternalServerErrorException(
        `Failed to update appointment: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    }
  }

  /**
   * Update appointment status (soft delete sets status to 'cancelled')
   */
  async updateStatus(
    id: string,
    status: 'requested' | 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
    user: UserContext,
    vetId?: string,
    notes?: string,
  ) {
    // Get current appointment
    const appointment = await this.findOne(id);

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Note: Timestamp fields (checked_in_at, started_at, completed_at, paid_at) 
    // are not in the database schema, so we don't set them

    if (vetId) {
      updateData.vet_id = vetId;
    }

    if (notes) {
      updateData.notes = notes;
    }

    const { data, error } = await this.supabaseService
      .getWriteClient(user.access_token)
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        payment_status,
        payment_reference,
        booking_reference,
        symptoms,
        notes,
        estimated_duration,
        emergency_level,
        created_at,
        updated_at,
        pet_id,
        client_id,
        vet_id,
        pets(
          id,
          name,
          species,
          breed,
          clients(
            id,
            phone,
            users!user_id(
              id,
              full_name,
              email
            )
          )
        ),
        users!vet_id(
          id,
          full_name
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Remove appointment (soft delete - sets status to 'cancelled')
   */
  async remove(id: string, user: UserContext) {
    // Soft delete by setting status to cancelled
    return this.updateStatus(id, 'cancelled', user);
  }

  /**
   * Get appointments by pet ID
   */
  async findByPet(petId: string, user: UserContext) {
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
    if (pet.tenant_id && user?.clinic_id !== pet.tenant_id && user?.role !== 'super_admin') {
      throw new ForbiddenException('Access denied: You do not have access to this pet');
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
        client: clientUser
          ? {
              id: clientData?.id || '',
              full_name: clientUser.full_name || clientUser.email?.split('@')[0] || 'Unknown',
              email: clientUser.email || '',
              phone: clientData?.phone,
            }
          : undefined,
        provider: provider
          ? {
              id: provider.id,
              full_name: provider.full_name || 'Unknown Provider',
            }
          : undefined,
        clinic_id: appointment.tenant_id || appointment.clinic_id,
      };
    });
  }

  /**
   * Get appointments by client ID and service type (e.g., for boarding reservations)
   */
  async findByClientAndServiceType(
    clientId: string,
    serviceType: string,
    includePast: boolean = false,
    user: UserContext,
  ) {
    // Validate user has access to this client's clinic
    // Note: clients table uses 'clinic_id', not 'tenant_id'
    const { data: client, error: clientError } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('clinic_id, organization_id, status')
      .eq('id', clientId)
      .or('status.is.null,status.neq.deleted') // Exclude soft-deleted clients
      .maybeSingle();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        throw new NotFoundException(`Client with id ${clientId} not found`);
      }
      throw new InternalServerErrorException(`Failed to fetch client: ${clientError.message}`);
    }

    if (!client) {
      throw new NotFoundException(`Client with id ${clientId} not found`);
    }

    // Validate clinic access
    if (client.clinic_id && user?.clinic_id !== client.clinic_id && user?.role !== 'super_admin') {
      throw new ForbiddenException('Access denied: You do not have access to this client');
    }

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        pet_id,
        notes,
        pets (
          id,
          name,
          species,
          breed
        )
      `)
      .eq('client_id', clientId)
      .eq('service_type', serviceType);

    if (!includePast) {
      const now = new Date();
      query = query.gte('appointment_time', now.toISOString());
    }

    const { data, error } = await query.order('appointment_time', { ascending: false });

    if (error) {
      console.error('Error fetching appointments by client and service type:', error);
      throw new InternalServerErrorException(
        `Failed to fetch appointments: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Check if an appointment is telehealth based on service type
   */
  private isTelehealthAppointment(serviceType: string): boolean {
    const type = serviceType?.toLowerCase() || '';
    return (
      type.includes('telehealth') ||
      type.includes('virtual') ||
      type.includes('online') ||
      type.includes('video')
    );
  }

  /**
   * Send appointment confirmation email
   */
  async sendConfirmationEmail(sendConfirmationDto: SendConfirmationEmailDto): Promise<{
    success: boolean;
    message: string;
    booking_reference?: string;
    error?: string;
  }> {
    const { appointment_id } = sendConfirmationDto;

    try {
      // Fetch appointment with all necessary relations
      const { data: appointment, error: appointmentError } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select(`
          *,
          pets(
            id,
            name,
            species,
            breed,
            clients(
              id,
              phone,
              users!user_id(
                id,
                full_name,
                email
              )
            )
          ),
          users!vet_id(
            id,
            full_name
          ),
          clinics!tenant_id(
            id,
            name,
            phone,
            address
          )
        `)
        .eq('id', appointment_id)
        .single();

      if (appointmentError || !appointment) {
        throw new NotFoundException(`Appointment with id ${appointment_id} not found`);
      }

      // Validate appointment status
      if (appointment.status !== 'scheduled') {
        throw new BadRequestException(
          `Cannot send confirmation email for appointment with status "${appointment.status}". Appointment must be "scheduled".`
        );
      }

      // Extract client email - handle array or single object
      const pets = Array.isArray(appointment.pets) ? appointment.pets[0] : appointment.pets;
      const clients = Array.isArray(pets?.clients) ? pets.clients[0] : pets?.clients;
      const users = Array.isArray(clients?.users) ? clients.users[0] : clients?.users;
      const clientUser = users;
      
      if (!clientUser || !clientUser.email) {
        throw new BadRequestException('Client email not found for this appointment');
      }

      // Get SendGrid API key
      const sendGridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
      if (!sendGridApiKey) {
        throw new InternalServerErrorException('SendGrid API key is not configured');
      }

      // Format appointment time
      const appointmentDate = new Date(appointment.appointment_time);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      // Generate booking reference (use appointment ID first 8 chars)
      const bookingReference = appointment_id.substring(0, 8).toUpperCase();

      // Prepare email content
      const petName = pets?.name || 'Your Pet';
      const petSpecies = pets?.species || 'N/A';
      const vetName = Array.isArray(appointment.users) ? appointment.users[0]?.full_name : appointment.users?.full_name;
      const clinic = Array.isArray(appointment.clinics) ? appointment.clinics[0] : appointment.clinics;
      
      const emailSubject = `Appointment Confirmation - ${petName}`;
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #008080; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #008080; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #555; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Appointment Confirmed</h1>
            </div>
            <div class="content">
              <p>Dear ${clientUser.full_name || 'Valued Client'},</p>
              <p>Your appointment has been confirmed. Please find the details below:</p>
              
              <div class="appointment-details">
                <div class="detail-row">
                  <span class="label">Pet:</span> ${petName} (${petSpecies})
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${formattedDate}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${formattedTime}
                </div>
                <div class="detail-row">
                  <span class="label">Veterinarian:</span> ${vetName || 'TBD'}
                </div>
                <div class="detail-row">
                  <span class="label">Clinic:</span> ${clinic?.name || 'N/A'}
                </div>
                ${clinic?.address ? `
                <div class="detail-row">
                  <span class="label">Address:</span> ${clinic.address}
                </div>
                ` : ''}
                ${clinic?.phone ? `
                <div class="detail-row">
                  <span class="label">Phone:</span> ${clinic.phone}
                </div>
                ` : ''}
                <div class="detail-row">
                  <span class="label">Booking Reference:</span> ${bookingReference}
                </div>
              </div>

              <p>If you need to reschedule or cancel, please contact the clinic at least 24 hours in advance.</p>
              <p>We look forward to seeing you!</p>
            </div>
            <div class="footer">
              <p>This is an automated confirmation email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email via SendGrid
      const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendGridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: clientUser.email, name: clientUser.full_name || 'Client' }],
              subject: emailSubject,
            },
          ],
          from: {
            email: this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@vetly.com',
            name: this.configService.get<string>('SENDGRID_FROM_NAME') || 'Vetly',
          },
          content: [
            {
              type: 'text/html',
              value: emailHtml,
            },
          ],
        }),
      });

      if (!sendGridResponse.ok) {
        const errorText = await sendGridResponse.text();
        console.error('SendGrid API error:', errorText);
        throw new InternalServerErrorException(`Failed to send email: ${sendGridResponse.statusText}`);
      }

      // Log notification in database
      const { error: notificationError } = await this.supabaseService
        .getClient()
        .from('appointment_notifications')
        .insert({
          appointment_id: appointment_id,
          notification_type: 'confirmation_email',
          status: 'sent',
          recipient_email: clientUser.email,
          sent_at: new Date().toISOString(),
        });

      if (notificationError) {
        console.error('Error logging notification:', notificationError);
        // Don't throw - email was sent successfully
      }

      return {
        success: true,
        message: 'Confirmation email sent successfully',
        booking_reference: bookingReference,
      };
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      
      // Re-throw HTTP exceptions (they should return proper status codes)
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof InternalServerErrorException) {
        throw error;
      }

      // For unexpected errors, return 500
      throw new InternalServerErrorException(
        `Failed to send confirmation email: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    }
  }

  /**
   * Get available veterinarians for a clinic (veterinarian and clinic_admin roles only)
   */
  async getAvailableVeterinarians(clinicId: string, user: UserContext) {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new BadRequestException('Access denied: Cannot access veterinarians for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, full_name, role')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .in('role', ['veterinarian', 'clinic_admin'])
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Error fetching available veterinarians:', error);
      throw new InternalServerErrorException(
        `Failed to fetch veterinarians: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Update overdue appointments to no_show status
   */
  async updateOverdueAppointments(clinicId: string, user: UserContext) {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new BadRequestException('Access denied: Cannot update appointments for other clinics');
    }

    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({
        status: 'no_show',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', clinicId)
      .eq('status', 'scheduled')
      .lt('appointment_time', twoHoursAgo.toISOString())
      .select();

    if (error) {
      console.error('Error updating overdue appointments:', error);
      
      // Handle check constraint violations (23514)
      if (error.code === '23514') {
        throw new BadRequestException(
          `Cannot update appointment status: ${error.message || 'Status value violates database constraint. The status "no_show" may not be allowed for these appointments, or the appointments may not meet the required conditions for status update.'}`
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to update overdue appointments: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Get appointments that need attention (overdue scheduled appointments)
   */
  async getAppointmentsNeedingAttention(clinicId: string, user: UserContext) {
    // Validate clinic access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new BadRequestException('Access denied: Cannot access appointments for other clinics');
    }

    const now = new Date();
    const fifteenMinutesAgo = new Date();
    fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        payment_status,
        payment_reference,
        booking_reference,
        symptoms,
        notes,
        estimated_duration,
        emergency_level,
        created_at,
        updated_at,
        pet_id,
        client_id,
        vet_id,
        pets(
          id,
          name,
          species,
          clients(
            id,
            phone,
            users!clients_user_id_fkey(
              id,
              full_name,
              email
            )
          )
        ),
        veterinarians:vet_id(
          id,
          full_name
        )
      `)
      .eq('tenant_id', clinicId)
      .eq('status', 'scheduled')
      .lt('appointment_time', fifteenMinutesAgo.toISOString())
      .order('appointment_time', { ascending: true });

    if (error) {
      console.error('Error fetching appointments needing attention:', error);
      throw new InternalServerErrorException(
        `Failed to fetch appointments: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }
}
