import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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

    // Only include vet_id if provided
    if (createAppointmentDto.vet_id) {
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
      .getClient()
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

    if (error) throw error;
    return data;
  }

  /**
   * Update an existing appointment
   */
  async update(id: string, updateAppointmentDto: UpdateAppointmentDto, user: UserContext) {
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
      .getClient()
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
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Appointment with id ${id} not found`);
      }
      throw error;
    }
    return data;
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
      .getClient()
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
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to send confirmation email',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
