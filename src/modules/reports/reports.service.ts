import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { UserContext } from '../auth/auth.guard';
import moment from 'moment';

@Injectable()
export class ReportsService {
  constructor(private supabaseService: SupabaseService) {}

  async getClinicStats(clinicId: string, startDate?: string, endDate?: string, user?: UserContext) {
    // Validate clinicId
    if (!clinicId || clinicId.trim() === '') {
      throw new BadRequestException('clinic_id is required');
    }

    // Validate clinic exists and user has access
    const { data: clinic, error: clinicError } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('id')
      .eq('id', clinicId)
      .single();

    if (clinicError || !clinic) {
      throw new NotFoundException(`Clinic with id ${clinicId} not found`);
    }

    // Check access permissions
    if (user) {
      if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
        throw new ForbiddenException('Access denied: You can only view stats for your own clinic');
      }
    }

    // Build appointments query with date filters
    let appointmentsQuery = this.supabaseService
      .getClient()
      .from('appointments')
      .select('id, status, appointment_time, is_telehealth')
      .eq('tenant_id', clinicId); // Use tenant_id, not clinic_id

    if (startDate) {
      appointmentsQuery = appointmentsQuery.gte('appointment_time', startDate);
    }
    if (endDate) {
      appointmentsQuery = appointmentsQuery.lte('appointment_time', endDate);
    }

    const { data: appointments, error: appointmentsError } = await appointmentsQuery;

    if (appointmentsError) {
      console.error('Error fetching appointments for clinic stats:', appointmentsError);
      throw new InternalServerErrorException(
        `Failed to fetch appointments: ${appointmentsError.message || 'Unknown error'}`,
      );
    }

    // Get additional stats in parallel
    const [clientsResult, petsResult, invoicesResult] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId),
      this.supabaseService
        .getClient()
        .from('pets')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', clinicId),
      this.supabaseService
        .getClient()
        .from('invoices')
        .select('id, amount, status')
        .eq('tenant_id', clinicId)
        .then((result) => {
          if (result.error) {
            return { data: [], error: result.error };
          }
          // Filter by date range if provided
          let invoices = result.data || [];
          if (startDate || endDate) {
            // Note: invoices might not have appointment_time, so we'll use issued_at
            // This is a simplified version - you may need to join with appointments
            return { data: invoices, error: null };
          }
          return { data: invoices, error: null };
        }),
    ]);

    if (clientsResult.error || petsResult.error) {
      console.error('Error fetching related stats:', { clients: clientsResult.error, pets: petsResult.error });
      // Don't throw, just log - we can still return partial stats
    }

    const appointmentsData = appointments || [];
    const totalAppointments = appointmentsData.length;
    const completedAppointments = appointmentsData.filter((apt: any) => apt.status === 'completed').length;
    const scheduledAppointments = appointmentsData.filter((apt: any) => apt.status === 'scheduled').length;
    const telehealthAppointments = appointmentsData.filter((apt: any) => apt.is_telehealth === true).length;
    const inClinicAppointments = totalAppointments - telehealthAppointments;

    const totalClients = clientsResult.count || 0;
    const totalPets = petsResult.count || 0;

    // Calculate revenue from invoices
    const invoicesData = invoicesResult.data || [];
    const totalRevenue = invoicesData
      .filter((inv: any) => inv.status === 'paid' || inv.status === 'Checked Out')
      .reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount) || 0), 0);

    const pendingRevenue = invoicesData
      .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'Checked Out')
      .reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount) || 0), 0);

    return {
      clinic_id: clinicId,
      total_appointments: totalAppointments,
      completed_appointments: completedAppointments,
      scheduled_appointments: scheduledAppointments,
      telehealth_appointments: telehealthAppointments,
      in_clinic_appointments: inClinicAppointments,
      total_clients: totalClients,
      total_pets: totalPets,
      total_revenue: totalRevenue,
      pending_revenue: pendingRevenue,
      date_range: {
        start_date: startDate || null,
        end_date: endDate || null,
      },
    };
  }

  async getPetReports(petId: string) {
    // This is a skeleton - implement actual reporting logic
    return {
      petId,
      // Add report data
    };
  }

  /**
   * Get Clients Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getClientsReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const {
      startDate,
      endDate,
      lastActivityStart,
      lastActivityEnd,
      status,
      hasAppointments,
      hasTelehealth,
      clinicId,
      organizationId,
      limit,
      offset,
    } = filters;

    // Use user's clinic_id if not provided
    const finalClinicId = clinicId || user.clinic_id;
    const finalOrganizationId = organizationId || user.organization_id;

    // Fetch all clients filtered by database-level filters (without pagination)
    let query = this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        id,
        created_at,
        status,
        phone,
        user_id,
        users!clients_user_id_fkey (
          full_name,
          email
        )
      `);

    // Apply organization/clinic filter
    if (finalOrganizationId) {
      query = query.eq('organization_id', finalOrganizationId);
    }
    if (finalClinicId) {
      query = query.eq('clinic_id', finalClinicId);
    }

    // Apply status filter
    if (status === 'active') {
      query = query.or('status.is.null,status.neq.inactive');
    } else if (status === 'inactive') {
      query = query.eq('status', 'inactive');
    }

    // Apply date range filter (created date)
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Order by created_at for consistent ordering
    query = query.order('created_at', { ascending: false });

    const { data: clients, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch clients: ${error.message}`);
    }
    if (!clients || clients.length === 0) {
      return { data: [], total: 0 };
    }

    // Get additional data for each client
    const clientIds = clients.map((c: any) => c.id);

    // Get pets count, appointments count, and sessions data in parallel
    const [petsResult, appointmentsResult, sessionsResult] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('pets')
        .select('client_id')
        .in('client_id', clientIds),
      this.supabaseService
        .getClient()
        .from('appointments')
        .select('client_id, created_at')
        .in('client_id', clientIds),
      this.supabaseService
        .getClient()
        .from('telehealth_sessions')
        .select('id, client_id, created_at, updated_at')
        .in('client_id', clientIds),
    ]);

    if (petsResult.error || appointmentsResult.error || sessionsResult.error) {
      throw new InternalServerErrorException('Failed to fetch related data for clients report');
    }

    const petsData = petsResult.data;
    const appointmentsData = appointmentsResult.data;
    const sessionsData = sessionsResult.data;

    const petsByClient = new Map<string, number>();
    petsData?.forEach((pet: any) => {
      petsByClient.set(pet.client_id, (petsByClient.get(pet.client_id) || 0) + 1);
    });

    const appointmentsByClient = new Map<string, { count: number; lastDate: string | null }>();
    appointmentsData?.forEach((apt: any) => {
      const existing = appointmentsByClient.get(apt.client_id) || { count: 0, lastDate: null };
      appointmentsByClient.set(apt.client_id, {
        count: existing.count + 1,
        lastDate: existing.lastDate
          ? apt.created_at > existing.lastDate
            ? apt.created_at
            : existing.lastDate
          : apt.created_at,
      });
    });

    const messagesByClient = new Map<string, number>();
    const lastActivityByClient = new Map<string, string | null>();

    // Get all messages for all sessions in a single query
    if (sessionsData && sessionsData.length > 0) {
      const sessionIds = sessionsData.map((s: any) => s.id);
      const { data: allMessages, error: messagesError } = await this.supabaseService
        .getClient()
        .from('telehealth_messages')
        .select('session_id')
        .in('session_id', sessionIds);

      if (messagesError) {
        throw new InternalServerErrorException(`Failed to fetch messages: ${messagesError.message}`);
      }

      // Count messages by session, then map to client
      const messagesBySession = new Map<string, number>();
      allMessages?.forEach((msg: any) => {
        messagesBySession.set(msg.session_id, (messagesBySession.get(msg.session_id) || 0) + 1);
      });

      // Map session messages to clients and track last activity
      sessionsData.forEach((session: any) => {
        const messageCount = messagesBySession.get(session.id) || 0;
        messagesByClient.set(session.client_id, (messagesByClient.get(session.client_id) || 0) + messageCount);

        const lastActivity = session.updated_at || session.created_at;
        const existing = lastActivityByClient.get(session.client_id);
        if (!existing || (lastActivity && lastActivity > existing)) {
          lastActivityByClient.set(session.client_id, lastActivity);
        }
      });
    }

    // Combine appointment last dates with session last dates
    appointmentsData?.forEach((apt: any) => {
      const lastDate = apt.created_at;
      const existing = lastActivityByClient.get(apt.client_id);
      if (!existing || (lastDate && lastDate > existing)) {
        lastActivityByClient.set(apt.client_id, lastDate);
      }
    });

    // Build result array with calculated fields
    let result = clients.map((client: any) => {
      const user = Array.isArray(client.users) ? client.users[0] : client.users;
      return {
        id: client.id,
        client_name: user?.full_name || 'Unknown',
        contact_info: {
          email: user?.email || '',
          phone: client.phone || '',
        },
        created_date: client.created_at,
        status: (client.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
        total_patients: petsByClient.get(client.id) || 0,
        total_appointments: appointmentsByClient.get(client.id)?.count || 0,
        total_messages: messagesByClient.get(client.id) || 0,
        last_activity_date: lastActivityByClient.get(client.id) || null,
      };
    });

    // Filter by hasAppointments
    if (hasAppointments === 'yes') {
      result = result.filter((c) => c.total_appointments > 0);
    } else if (hasAppointments === 'no') {
      result = result.filter((c) => c.total_appointments === 0);
    }

    // Filter by hasTelehealth
    if (hasTelehealth === 'yes') {
      result = result.filter((c) => c.total_messages > 0);
    } else if (hasTelehealth === 'no') {
      result = result.filter((c) => c.total_messages === 0);
    }

    // Filter by last activity date range
    if (lastActivityStart || lastActivityEnd) {
      result = result.filter((client) => {
        const lastActivity = client.last_activity_date;
        if (!lastActivity) {
          // If no last activity, only include if no end date filter is set
          return !lastActivityEnd;
        }

        const activityDate = moment(lastActivity).format('YYYY-MM-DD');

        if (lastActivityStart && activityDate < lastActivityStart) {
          return false;
        }
        if (lastActivityEnd && activityDate > lastActivityEnd) {
          return false;
        }
        return true;
      });
    }

    // Get total count after all filters
    const totalCount = result.length;

    // Apply pagination
    const paginatedResult =
      limit !== undefined && offset !== undefined
        ? result.slice(offset, offset + limit)
        : limit !== undefined
          ? result.slice(0, limit)
          : result;

    return {
      data: paginatedResult,
      total: totalCount,
    };
  }

  /**
   * Get Patients Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getPatientsReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const {
      species,
      breed,
      clientId,
      status,
      startDate,
      endDate,
      clinicId,
      organizationId,
      limit,
      offset,
    } = filters;

    // Use user's clinic_id if not provided
    const finalClinicId = clinicId || user.clinic_id;
    const finalOrganizationId = organizationId || user.organization_id;

    // If organizationId is provided, we need to get client IDs that belong to that organization
    let clientIdsForOrg: string[] | null = null;
    if (finalOrganizationId) {
      const { data: orgClients, error: orgClientsError } = await this.supabaseService
        .getClient()
        .from('clients')
        .select('id')
        .eq('organization_id', finalOrganizationId);

      if (orgClientsError) {
        throw new InternalServerErrorException(`Failed to fetch organization clients: ${orgClientsError.message}`);
      }

      if (orgClients && orgClients.length > 0) {
        clientIdsForOrg = orgClients.map((c: any) => c.id);
      } else {
        return { data: [], total: 0 };
      }
    }

    // Build client ID filter
    let finalClientIds: string[] | null = null;
    if (clientId) {
      finalClientIds = [clientId];
    } else if (clientIdsForOrg) {
      finalClientIds = clientIdsForOrg;
    }

    // First, get total count
    let countQuery = this.supabaseService
      .getClient()
      .from('pets')
      .select('*', { count: 'exact', head: true });

    if (finalClinicId) {
      countQuery = countQuery.eq('tenant_id', finalClinicId);
    }

    if (finalClientIds && finalClientIds.length > 0) {
      countQuery = countQuery.in('client_id', finalClientIds);
    } else if (finalClientIds && finalClientIds.length === 0) {
      return { data: [], total: 0 };
    }

    if (species) {
      countQuery = countQuery.eq('species', species);
    }
    if (breed) {
      countQuery = countQuery.eq('breed', breed);
    }
    if (status === 'active') {
      countQuery = countQuery.or('status.is.null,status.neq.inactive');
    } else if (status === 'inactive') {
      countQuery = countQuery.eq('status', 'inactive');
    }
    if (startDate) {
      countQuery = countQuery.gte('created_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('created_at', endDate);
    }

    // Build data query
    let query = this.supabaseService
      .getClient()
      .from('pets')
      .select(`
        id,
        name,
        species,
        breed,
        gender,
        status,
        client_id,
        created_at,
        clients!pets_client_id_fkey (
          id,
          users!clients_user_id_fkey (
            full_name
          )
        )
      `);

    if (finalClinicId) {
      query = query.eq('tenant_id', finalClinicId);
    }

    if (finalClientIds && finalClientIds.length > 0) {
      query = query.in('client_id', finalClientIds);
    } else if (finalClientIds && finalClientIds.length === 0) {
      return { data: [], total: 0 };
    }

    if (species) {
      query = query.eq('species', species);
    }
    if (breed) {
      query = query.eq('breed', breed);
    }
    if (status === 'active') {
      query = query.or('status.is.null,status.neq.inactive');
    } else if (status === 'inactive') {
      query = query.eq('status', 'inactive');
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    query = query.order('created_at', { ascending: false });

    // Apply pagination
    if (offset !== undefined && limit) {
      query = query.range(offset, offset + limit - 1);
    } else if (limit) {
      query = query.limit(limit);
    }

    // Run count and data queries in parallel
    const [{ count: totalCount }, { data: pets, error }] = await Promise.all([countQuery, query]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch patients: ${error.message}`);
    }
    if (!pets) {
      return { data: [], total: totalCount || 0 };
    }

    const petIds = pets.map((p: any) => p.id);

    // Get appointments and telehealth sessions in parallel
    const [appointmentsResult, sessionsResult] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('appointments')
        .select('pet_id, appointment_time, status')
        .in('pet_id', petIds)
        .eq('status', 'completed')
        .order('appointment_time', { ascending: false }),
      this.supabaseService
        .getClient()
        .from('telehealth_sessions')
        .select('pet_id')
        .in('pet_id', petIds),
    ]);

    if (appointmentsResult.error || sessionsResult.error) {
      throw new InternalServerErrorException('Failed to fetch related data for patients report');
    }

    const appointments = appointmentsResult.data;
    const sessions = sessionsResult.data;

    const appointmentsByPet = new Map<string, { count: number; lastVisit: string | null }>();
    appointments?.forEach((apt: any) => {
      const existing = appointmentsByPet.get(apt.pet_id) || { count: 0, lastVisit: null };
      appointmentsByPet.set(apt.pet_id, {
        count: existing.count + 1,
        lastVisit: existing.lastVisit
          ? apt.appointment_time > existing.lastVisit
            ? apt.appointment_time
            : existing.lastVisit
          : apt.appointment_time,
      });
    });

    const sessionsByPet = new Map<string, number>();
    sessions?.forEach((session: any) => {
      sessionsByPet.set(session.pet_id, (sessionsByPet.get(session.pet_id) || 0) + 1);
    });

    const result = pets.map((pet: any) => {
      const client = Array.isArray(pet.clients) ? pet.clients[0] : pet.clients;
      const user = Array.isArray(client?.users) ? client?.users[0] : client?.users;
      const aptData = appointmentsByPet.get(pet.id) || { count: 0, lastVisit: null };

      return {
        id: pet.id,
        patient_name: pet.name || 'Unnamed',
        species: pet.species || 'Unknown',
        breed: pet.breed,
        gender: pet.gender,
        owner: user?.full_name || 'Unknown',
        status: pet.status || 'active',
        total_appointments: aptData.count,
        total_telehealth_sessions: sessionsByPet.get(pet.id) || 0,
        last_visit_date: aptData.lastVisit,
      };
    });

    return {
      data: result,
      total: totalCount || 0,
    };
  }

  /**
   * Get Appointments Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getAppointmentsReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const {
      startDate,
      endDate,
      status,
      species,
      service,
      vetId,
      clientId,
      appointmentType,
      clinicId,
      limit,
      offset,
    } = filters;

    const finalClinicId = clinicId || user.clinic_id;

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        estimated_duration,
        is_telehealth,
        pet_id,
        client_id,
        vet_id,
        pets!appointments_pet_id_fkey (
          name,
          species
        ),
        clients!appointments_client_id_fkey (
          users!clients_user_id_fkey (
            full_name
          )
        ),
        users!appointments_vet_id_fkey (
          full_name
        )
      `);

    if (finalClinicId) {
      query = query.eq('tenant_id', finalClinicId);
    }
    if (startDate) {
      query = query.gte('appointment_time', startDate);
    }
    if (endDate) {
      query = query.lte('appointment_time', endDate);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (vetId) {
      query = query.eq('vet_id', vetId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (service) {
      query = query.eq('service_type', service);
    }
    if (appointmentType === 'telehealth') {
      query = query.eq('is_telehealth', true);
    } else if (appointmentType === 'in-clinic') {
      query = query.eq('is_telehealth', false);
    }

    // Count query
    let countQuery = this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true });

    if (finalClinicId) {
      countQuery = countQuery.eq('tenant_id', finalClinicId);
    }
    if (startDate) {
      countQuery = countQuery.gte('appointment_time', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('appointment_time', endDate);
    }
    if (status) {
      countQuery = countQuery.eq('status', status);
    }
    if (vetId) {
      countQuery = countQuery.eq('vet_id', vetId);
    }
    if (clientId) {
      countQuery = countQuery.eq('client_id', clientId);
    }
    if (service) {
      countQuery = countQuery.eq('service_type', service);
    }
    if (appointmentType === 'telehealth') {
      countQuery = countQuery.eq('is_telehealth', true);
    } else if (appointmentType === 'in-clinic') {
      countQuery = countQuery.eq('is_telehealth', false);
    }

    query = query.order('appointment_time', { ascending: false });

    if (offset !== undefined && limit) {
      query = query.range(offset, offset + limit - 1);
    } else if (limit) {
      query = query.limit(limit);
    }

    const [{ count: totalCount }, { data: appointments, error }] = await Promise.all([countQuery, query]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch appointments: ${error.message}`);
    }
    if (!appointments) {
      return { data: [], total: totalCount || 0 };
    }

    // Filter by species (client-side)
    let filtered = appointments;
    if (species) {
      filtered = filtered.filter((apt: any) => {
        const pet = Array.isArray(apt.pets) ? apt.pets[0] : apt.pets;
        return pet?.species === species;
      });
    }

    const result = filtered.map((apt: any) => {
      const pet = Array.isArray(apt.pets) ? apt.pets[0] : apt.pets;
      const client = Array.isArray(apt.clients) ? apt.clients[0] : apt.clients;
      const user = Array.isArray(client?.users) ? client?.users[0] : client?.users;
      const vet = Array.isArray(apt.users) ? apt.users[0] : apt.users;

      let type: 'telehealth' | 'in-clinic' | 'phone' | 'video' = 'in-clinic';
      if (apt.is_telehealth) {
        type = 'telehealth';
      }

      return {
        id: apt.id,
        appointment_id: apt.id,
        date_time: apt.appointment_time,
        type,
        status: apt.status,
        client: user?.full_name || 'Unknown',
        patient: pet?.name || 'Unknown',
        species: pet?.species || 'Unknown',
        service: apt.service_type || 'Unknown',
        vet: vet?.full_name || null,
        duration: apt.estimated_duration || null,
      };
    });

    return {
      data: result,
      total: totalCount || 0,
    };
  }

  /**
   * Get Telehealth Sessions Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getTelehealthSessionsReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const { startDate, endDate, status, species, service, vetId, clientId, limit, offset } = filters;

    let query = this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select(`
        id,
        status,
        consultation_type,
        created_at,
        vet_id,
        client_id,
        pet_id,
        appointment_id,
        pets!telehealth_sessions_pet_id_fkey (
          name,
          species
        ),
        clients!telehealth_sessions_client_id_fkey (
          users!clients_user_id_fkey (
            full_name
          )
        ),
        users!telehealth_sessions_vet_id_fkey (
          full_name
        ),
        appointments!telehealth_sessions_appointment_id_fkey (
          service_type
        )
      `);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (vetId) {
      query = query.eq('vet_id', vetId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    let countQuery = this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('*', { count: 'exact', head: true });

    if (startDate) {
      countQuery = countQuery.gte('created_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('created_at', endDate);
    }
    if (status) {
      countQuery = countQuery.eq('status', status);
    }
    if (vetId) {
      countQuery = countQuery.eq('vet_id', vetId);
    }
    if (clientId) {
      countQuery = countQuery.eq('client_id', clientId);
    }

    query = query.order('created_at', { ascending: false });

    if (offset !== undefined && limit) {
      query = query.range(offset, offset + limit - 1);
    } else if (limit) {
      query = query.limit(limit);
    }

    const [{ count: totalCount }, { data: sessions, error }] = await Promise.all([countQuery, query]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch telehealth sessions: ${error.message}`);
    }
    if (!sessions) {
      return { data: [], total: totalCount || 0 };
    }

    // Filter by species and service (client-side)
    let filtered = sessions;
    if (species) {
      filtered = filtered.filter((session: any) => {
        const pet = Array.isArray(session.pets) ? session.pets[0] : session.pets;
        return pet?.species === species;
      });
    }
    if (service) {
      filtered = filtered.filter((session: any) => {
        const apt = Array.isArray(session.appointments) ? session.appointments[0] : session.appointments;
        return apt?.service_type === service;
      });
    }

    const sessionIds = filtered.map((s: any) => s.id);
    if (sessionIds.length > 0) {
      const { data: messages, error: messagesError } = await this.supabaseService
        .getClient()
        .from('telehealth_messages')
        .select('session_id, id')
        .in('session_id', sessionIds);

      if (messagesError) {
        throw new InternalServerErrorException(`Failed to fetch messages: ${messagesError.message}`);
      }

      const messageCounts = new Map<string, number>();
      messages?.forEach((msg: any) => {
        messageCounts.set(msg.session_id, (messageCounts.get(msg.session_id) || 0) + 1);
      });

      const result = filtered.map((session: any) => {
        const pet = Array.isArray(session.pets) ? session.pets[0] : session.pets;
        const client = Array.isArray(session.clients) ? session.clients[0] : session.clients;
        const user = Array.isArray(client?.users) ? client?.users[0] : client?.users;
        const vet = Array.isArray(session.users) ? session.users[0] : session.users;
        const apt = Array.isArray(session.appointments) ? session.appointments[0] : session.appointments;

        return {
          id: session.id,
          session_id: session.id,
          status: session.status,
          client: user?.full_name || 'Unknown',
          patient: pet?.name || 'Unknown',
          species: pet?.species || null,
          service: apt?.service_type || null,
          vet: vet?.full_name || 'Unknown',
          created_at: session.created_at,
          message_count: messageCounts.get(session.id) || 0,
        };
      });

      return {
        data: result,
        total: totalCount || 0,
      };
    }

    return { data: [], total: totalCount || 0 };
  }

  /**
   * Get Messages Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getMessagesReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const { startDate, endDate, vetId, clientId, unreadUnresponded, clinicId, organizationId, limit, offset } = filters;

    const finalClinicId = clinicId || user.clinic_id;
    const finalOrganizationId = organizationId || user.organization_id;

    // Get sessions first to filter by clinic/org
    let sessionsQuery = this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('id, client_id, vet_id, appointment_id');

    // Filter sessions by clinic through clients
    if (finalClinicId) {
      const { data: clinicClients } = await this.supabaseService
        .getClient()
        .from('clients')
        .select('id')
        .eq('clinic_id', finalClinicId);

      if (clinicClients && clinicClients.length > 0) {
        const clientIds = clinicClients.map((c: any) => c.id);
        sessionsQuery = sessionsQuery.in('client_id', clientIds);
      } else {
        return { data: [], total: 0 };
      }
    }

    // Filter by organization through clients
    if (finalOrganizationId) {
      const { data: orgClients } = await this.supabaseService
        .getClient()
        .from('clients')
        .select('id')
        .eq('organization_id', finalOrganizationId);

      if (orgClients && orgClients.length > 0) {
        const clientIds = orgClients.map((c: any) => c.id);
        sessionsQuery = sessionsQuery.in('client_id', clientIds);
      } else {
        return { data: [], total: 0 };
      }
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery;

    if (sessionsError) {
      throw new InternalServerErrorException(`Failed to fetch sessions: ${sessionsError.message}`);
    }

    const sessionIds = sessions?.map((s: any) => s.id) || [];

    if (sessionIds.length === 0) {
      return { data: [], total: 0 };
    }

    // Count query
    let countQuery = this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*', { count: 'exact', head: true })
      .in('session_id', sessionIds);

    if (startDate) {
      countQuery = countQuery.gte('created_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('created_at', endDate);
    }

    // Messages query
    let messagesQuery = this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select(`
        id,
        session_id,
        sender_id,
        sender_type,
        created_at,
        is_read,
        telehealth_sessions!telehealth_messages_session_id_fkey (
          client_id,
          vet_id,
          appointment_id,
          clients!telehealth_sessions_client_id_fkey (
            users!clients_user_id_fkey (
              full_name
            )
          ),
          users!telehealth_sessions_vet_id_fkey (
            full_name
          )
        )
      `)
      .in('session_id', sessionIds);

    if (startDate) {
      messagesQuery = messagesQuery.gte('created_at', startDate);
    }
    if (endDate) {
      messagesQuery = messagesQuery.lte('created_at', endDate);
    }

    messagesQuery = messagesQuery.order('created_at', { ascending: false });

    if (offset !== undefined && limit) {
      messagesQuery = messagesQuery.range(offset, offset + limit - 1);
    } else if (limit) {
      messagesQuery = messagesQuery.limit(limit);
    }

    const [{ count: totalCount }, { data: messages, error }] = await Promise.all([countQuery, messagesQuery]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch messages: ${error.message}`);
    }
    if (!messages) {
      return { data: [], total: totalCount || 0 };
    }

    let filtered = messages;
    if (unreadUnresponded === 'unread') {
      filtered = filtered.filter((m: any) => !m.is_read);
    }

    const result = filtered.map((msg: any) => {
      const session = Array.isArray(msg.telehealth_sessions) ? msg.telehealth_sessions[0] : msg.telehealth_sessions;
      const client = Array.isArray(session?.clients) ? session?.clients[0] : session?.clients;
      const user = Array.isArray(client?.users) ? client?.users[0] : client?.users;
      const vet = Array.isArray(session?.users) ? session?.users[0] : session?.users;

      return {
        id: msg.id,
        message_id: msg.id,
        session_appointment: session?.appointment_id || null,
        sender_type: msg.sender_type as 'client' | 'vet',
        vet: vet?.full_name || null,
        client: user?.full_name || 'Unknown',
        timestamp: msg.created_at,
        is_read: msg.is_read,
        is_responded: false, // Would require more complex logic
      };
    });

    return {
      data: result,
      total: totalCount || 0,
    };
  }

  /**
   * Get Services Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getServicesReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const { startDate, endDate, appointmentType, clinicId, organizationId, limit, offset } = filters;

    const finalClinicId = clinicId || user.clinic_id;
    const finalOrganizationId = organizationId || user.organization_id;

    let appointmentsQuery = this.supabaseService
      .getClient()
      .from('appointments')
      .select('service_type, pet_id, client_id, is_telehealth, appointment_time, pets!appointments_pet_id_fkey(species)', {
        count: 'exact',
      });

    if (finalClinicId) {
      appointmentsQuery = appointmentsQuery.eq('tenant_id', finalClinicId);
    }

    if (startDate) {
      appointmentsQuery = appointmentsQuery.gte('appointment_time', startDate);
    }
    if (endDate) {
      appointmentsQuery = appointmentsQuery.lte('appointment_time', endDate);
    }
    if (appointmentType === 'telehealth') {
      appointmentsQuery = appointmentsQuery.eq('is_telehealth', true);
    } else if (appointmentType === 'in-clinic') {
      appointmentsQuery = appointmentsQuery.eq('is_telehealth', false);
    }

    const orgClientsPromise = finalOrganizationId
      ? this.supabaseService
          .getClient()
          .from('clients')
          .select('id')
          .eq('organization_id', finalOrganizationId)
      : null;

    const results = await Promise.all([
      appointmentsQuery,
      ...(orgClientsPromise ? [orgClientsPromise] : []),
    ]);
    const appointmentsResult = results[0];
    const orgClientsResult = finalOrganizationId ? results[1] : null;

    const { data: appointments, error: appointmentsError, count } = appointmentsResult as any;

    if (appointmentsError) {
      throw new InternalServerErrorException(`Failed to fetch appointments: ${appointmentsError.message}`);
    }

    if (!appointments || appointments.length === 0) {
      return { data: [], total: 0 };
    }

    // Filter by organization if needed
    let filteredAppointments = appointments;
    if (finalOrganizationId && orgClientsResult) {
      const { data: orgClients } = orgClientsResult as any;

      if (orgClients && orgClients.length > 0) {
        const clientIds = orgClients.map((c: any) => c.id);
        filteredAppointments = appointments.filter(
          (apt: any) => apt.client_id && clientIds.includes(apt.client_id),
        );
        if (filteredAppointments.length === 0) {
          return { data: [], total: 0 };
        }
      } else {
        return { data: [], total: 0 };
      }
    }

    // Aggregate by service type
    const serviceStats = new Map<
      string,
      {
        appointmentCount: number;
        telehealthCount: number;
        speciesMix: Record<string, number>;
      }
    >();

    filteredAppointments?.forEach((apt: any) => {
      const serviceName = apt.service_type;
      if (!serviceName) return;

      const stats = serviceStats.get(serviceName) || {
        appointmentCount: 0,
        telehealthCount: 0,
        speciesMix: {},
      };
      stats.appointmentCount++;

      if (apt.is_telehealth) {
        stats.telehealthCount++;
      }

      const pet = Array.isArray(apt.pets) ? apt.pets[0] : apt.pets;
      if (pet?.species) {
        stats.speciesMix[pet.species] = (stats.speciesMix[pet.species] || 0) + 1;
      }

      serviceStats.set(serviceName, stats);
    });

    const uniqueServices = Array.from(serviceStats.keys()).sort();
    const totalCount = uniqueServices.length;

    // Apply pagination
    let paginatedServices: string[];
    if (offset !== undefined && limit) {
      paginatedServices = uniqueServices.slice(offset, offset + limit);
    } else if (limit) {
      paginatedServices = uniqueServices.slice(0, limit);
    } else {
      paginatedServices = uniqueServices;
    }

    const result = paginatedServices.map((serviceName, index) => {
      const stats = serviceStats.get(serviceName) || {
        appointmentCount: 0,
        telehealthCount: 0,
        speciesMix: {},
      };

      return {
        id: `${serviceName}-${index}`,
        service_name: serviceName,
        appointment_count: stats.appointmentCount,
        telehealth_count: stats.telehealthCount,
        species_mix: stats.speciesMix,
      };
    });

    return {
      data: result,
      total: totalCount,
    };
  }

  /**
   * Get Tasks Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getTasksReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const { openCompleted, overdue, userId, startDate, endDate, clinicId, organizationId, limit, offset } = filters;

    const finalClinicId = clinicId || user.clinic_id;
    const finalOrganizationId = organizationId || user.organization_id;

    let query = this.supabaseService
      .getClient()
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        due_date,
        assigned_to,
        client_id,
        patient_id,
        created_at,
        users!tasks_assigned_to_fkey (
          full_name
        )
      `);

    if (finalClinicId) {
      query = query.eq('clinic_id', finalClinicId);
    }
    if (finalOrganizationId) {
      query = query.eq('organization_id', finalOrganizationId);
    }
    if (openCompleted === 'open') {
      query = query.in('status', ['open', 'in_progress']);
    } else if (openCompleted === 'closed') {
      query = query.eq('status', 'closed');
    }
    if (userId) {
      query = query.eq('assigned_to', userId);
    }
    if (startDate) {
      query = query.gte('due_date', startDate);
    }
    if (endDate) {
      query = query.lte('due_date', endDate);
    }

    let countQuery = this.supabaseService
      .getClient()
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    if (finalClinicId) {
      countQuery = countQuery.eq('clinic_id', finalClinicId);
    }
    if (finalOrganizationId) {
      countQuery = countQuery.eq('organization_id', finalOrganizationId);
    }
    if (openCompleted === 'open') {
      countQuery = countQuery.in('status', ['open', 'in_progress']);
    } else if (openCompleted === 'closed') {
      countQuery = countQuery.eq('status', 'closed');
    }
    if (userId) {
      countQuery = countQuery.eq('assigned_to', userId);
    }
    if (startDate) {
      countQuery = countQuery.gte('due_date', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('due_date', endDate);
    }

    query = query.order('due_date', { ascending: true });

    if (offset !== undefined && limit) {
      query = query.range(offset, offset + limit - 1);
    } else if (limit) {
      query = query.limit(limit);
    }

    const [{ count: totalCount }, { data: tasks, error }] = await Promise.all([countQuery, query]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch tasks: ${error.message}`);
    }
    if (!tasks) {
      return { data: [], total: totalCount || 0 };
    }

    // Filter overdue (client-side)
    let filtered = tasks;
    if (overdue === 'yes') {
      const now = moment().format('YYYY-MM-DD');
      filtered = filtered.filter(
        (task: any) => task.status !== 'closed' && task.due_date < now,
      );
    }

    const result = filtered.map((task: any) => {
      const user = Array.isArray(task.users) ? task.users[0] : task.users;

      return {
        id: task.id,
        task_name: task.title,
        type: task.description ? 'other' : null,
        related_appointment_session: null,
        assigned_user: user?.full_name || null,
        status: task.status as 'open' | 'in_progress' | 'closed',
        due_date: task.due_date,
      };
    });

    return {
      data: result,
      total: totalCount || 0,
    };
  }

  /**
   * Get Financial Report Data with pagination
   * Matches the frontend logic exactly
   */
  async getFinancialReport(filters: ReportFiltersDto, user: UserContext): Promise<any> {
    const { startDate, endDate, paidUnpaid, service, clientId, clinicId, limit, offset } = filters;

    const finalClinicId = clinicId || user.clinic_id;

    let query = this.supabaseService
      .getClient()
      .from('invoices')
      .select(`
        id,
        amount,
        status,
        issued_at,
        client_id,
        appointment_id,
        clients!invoices_client_id_fkey (
          users!clients_user_id_fkey (
            full_name
          )
        ),
        appointments!invoices_appointment_id_fkey (
          service_type
        )
      `);

    if (finalClinicId) {
      query = query.eq('tenant_id', finalClinicId);
    }
    if (startDate) {
      query = query.gte('issued_at', startDate);
    }
    if (endDate) {
      query = query.lte('issued_at', endDate);
    }
    if (paidUnpaid === 'paid') {
      query = query.in('status', ['paid', 'Checked Out']);
    } else if (paidUnpaid === 'unpaid') {
      query = query.not('status', 'in', ['paid', 'Checked Out']);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    let countQuery = this.supabaseService
      .getClient()
      .from('invoices')
      .select('*', { count: 'exact', head: true });

    if (finalClinicId) {
      countQuery = countQuery.eq('tenant_id', finalClinicId);
    }
    if (startDate) {
      countQuery = countQuery.gte('issued_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('issued_at', endDate);
    }
    if (paidUnpaid === 'paid') {
      countQuery = countQuery.in('status', ['paid', 'Checked Out']);
    } else if (paidUnpaid === 'unpaid') {
      countQuery = countQuery.not('status', 'in', ['paid', 'Checked Out']);
    }
    if (clientId) {
      countQuery = countQuery.eq('client_id', clientId);
    }

    query = query.order('issued_at', { ascending: false });

    if (offset !== undefined && limit) {
      query = query.range(offset, offset + limit - 1);
    } else if (limit) {
      query = query.limit(limit);
    }

    const [{ count: totalCount }, { data: invoices, error }] = await Promise.all([countQuery, query]);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch invoices: ${error.message}`);
    }
    if (!invoices) {
      return { data: [], total: totalCount || 0 };
    }

    // Filter by service (client-side)
    let filtered = invoices;
    if (service) {
      filtered = filtered.filter((inv: any) => {
        const apt = Array.isArray(inv.appointments) ? inv.appointments[0] : inv.appointments;
        return apt?.service_type === service;
      });
    }

    const result = filtered.map((invoice: any) => {
      const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients;
      const user = Array.isArray(client?.users) ? client?.users[0] : client?.users;
      const apt = Array.isArray(invoice.appointments) ? invoice.appointments[0] : invoice.appointments;

      return {
        id: invoice.id,
        appointment_invoice: invoice.appointment_id || invoice.id,
        client: user?.full_name || 'Unknown',
        service: apt?.service_type || null,
        amount: invoice.amount || 0,
        payment_status: invoice.status || null,
        date: invoice.issued_at,
      };
    });

    return {
      data: result,
      total: totalCount || 0,
    };
  }

  /**
   * Get unique service types for filter options
   * Matches the frontend logic for fetching service types
   */
  async getServiceTypes(clinicId: string): Promise<string[]> {
    if (!clinicId) {
      return [];
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('service_type')
      .eq('tenant_id', clinicId)
      .not('service_type', 'is', null);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch service types: ${error.message}`);
    }

    // Get unique service types
    const uniqueServices = [...new Set(data?.map((a: any) => a.service_type).filter(Boolean) || [])];
    return uniqueServices;
  }
}
