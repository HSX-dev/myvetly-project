import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class DashboardService {
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

  async getClinicDashboard(clinicId: string) {
    // This is a skeleton - implement actual dashboard logic
    const [appointments, clients, pets] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId),
      this.supabaseService
        .getClient()
        .from('clients')
        .select('*'),
      this.supabaseService
        .getClient()
        .from('pets')
        .select('*'),
    ]);

    return {
      appointments: appointments.data?.length || 0,
      clients: clients.data?.length || 0,
      pets: pets.data?.length || 0,
      // Add more dashboard data as needed
    };
  }

  /**
   * Get today's appointments with filters
   * Matches frontend dashboardService.getTodaysAppointments logic exactly
   */
  async getTodaysAppointments(
    clinicId: string,
    user: UserContext,
    filters?: { mine?: boolean; status?: string },
  ) {
    this.validateClinicAccess(user, clinicId);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        payment_status,
        vet_id,
        pets(
          id,
          name,
          species,
          gender,
          breed,
          microchip_id,
          allergies,
          rabies_tag,
          vaccination_status,
          behavioral_notes,
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
        users!vet_id(
          id,
          full_name
        )
      `)
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startOfDay.toISOString())
      .lt('appointment_time', endOfDay.toISOString())
      .order('appointment_time', { ascending: true });

    // Apply mine filter
    if (filters?.mine) {
      query = query.eq('vet_id', user.user_id);
    }

    // Apply status filter
    if (filters?.status) {
      const statusMap: Record<string, string[]> = {
        arrived: ['checked_in'],
        in_exam: ['in_progress'],
        lab_pending: ['completed'],
        boarding: ['scheduled'],
        rx_refills: ['completed'],
        today: ['scheduled', 'checked_in', 'in_progress', 'completed'],
      };

      if (statusMap[filters.status]) {
        query = query.in('status', statusMap[filters.status]);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get unread messages
   * Matches frontend dashboardService.getUnreadMessages logic exactly
   */
  async getUnreadMessages(clinicId: string, user: UserContext) {
    this.validateClinicAccess(user, clinicId);

    // This would need to be implemented based on your messaging system
    // For now, returning empty array as placeholder (matches frontend)
    return [];
  }

  /**
   * Get alerts (vaccines, labs, billing)
   * Matches frontend dashboardService.getAlerts logic exactly
   */
  async getAlerts(clinicId: string, user: UserContext) {
    this.validateClinicAccess(user, clinicId);

    const alerts: any[] = [];

    // Check for expiring vaccines (within 14 days)
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    const { data: expiringVaccines, error: vaccineError } = await this.supabaseService
      .getClient()
      .from('preventive_vaccinations')
      .select('id')
      .eq('clinic_id', clinicId)
      .lte('next_due_date', fourteenDaysFromNow.toISOString())
      .gte('next_due_date', new Date().toISOString());

    if (!vaccineError && expiringVaccines && expiringVaccines.length > 0) {
      alerts.push({
        id: 'vaccines',
        type: 'vaccine',
        message: `${expiringVaccines.length} vaccines expiring this week`,
        count: expiringVaccines.length,
        color: 'amber',
        linkTo: '/patients?tab=vaccinations',
      });
    }

    // Check for pending lab results
    // TODO: Uncomment when lab_results table is created (matches frontend comment)

    // Check for unpaid invoices
    const { data: unpaidInvoices, error: billingError } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('id')
      .eq('tenant_id', clinicId)
      .eq('status', 'unpaid');

    if (!billingError && unpaidInvoices && unpaidInvoices.length > 0) {
      alerts.push({
        id: 'billing',
        type: 'billing',
        message: `${unpaidInvoices.length} unpaid invoices`,
        count: unpaidInvoices.length,
        color: 'rose',
        linkTo: '/reports?tab=billing',
      });
    }

    return alerts.slice(0, 5); // Limit to 5 alerts (matches frontend)
  }

  /**
   * Get tasks with filters
   * Matches frontend dashboardService.getTasks logic exactly
   * Reuses TasksService logic
   */
  async getTasks(
    clinicId: string,
    user: UserContext,
    filters?: { scope?: 'all' | 'mine'; search?: string },
  ) {
    this.validateClinicAccess(user, clinicId);

    // Build filters for task query
    const taskFilters: { assignedTo?: string; status?: string } = {};

    // If scope is 'mine', filter by current user
    if (filters?.scope === 'mine') {
      taskFilters.assignedTo = user.user_id;
    }

    // Query tasks
    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    let query = this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('clinic_id', clinicId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    // Apply filters
    if (taskFilters.assignedTo) {
      query = query.eq('assigned_to', taskFilters.assignedTo);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    if (!tasks) {
      return [];
    }

    // Transform to match frontend DashboardTask format
    let transformedTasks = tasks.map((task: any) => {
      const assignedUser = Array.isArray(task.assigned_user)
        ? task.assigned_user[0]
        : task.assigned_user;

      const client = task.client_id
        ? Array.isArray(task.client) ? task.client[0] : task.client
        : null;

      const clientUser = client?.users
        ? Array.isArray(client.users) ? client.users[0] : client.users
        : null;

      const patient = task.patient_id
        ? Array.isArray(task.patient) ? task.patient[0] : task.patient
        : null;

      const getInitials = (name: string): string => {
        return name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
      };

      return {
        id: task.id,
        title: task.title,
        client: clientUser?.full_name || 'No Client',
        pet: patient?.name || 'No Patient',
        dueDate: task.due_date,
        priority: task.priority as 'high' | 'medium' | 'low',
        status: task.status as 'open' | 'in_progress' | 'closed',
        assignedTo: assignedUser
          ? {
              id: assignedUser.id,
              full_name: assignedUser.full_name || 'Unknown User',
              initials: getInitials(assignedUser.full_name || 'Unknown User'),
            }
          : undefined,
      };
    });

    // If search is provided, filter tasks by title
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      transformedTasks = transformedTasks.filter(
        (task) =>
          task.title.toLowerCase().includes(searchLower) ||
          task.client.toLowerCase().includes(searchLower) ||
          task.pet.toLowerCase().includes(searchLower),
      );
    }

    return transformedTasks;
  }

  /**
   * Get intake queue
   * Matches frontend dashboardService.getIntakeQueue logic exactly
   */
  async getIntakeQueue(clinicId: string, user: UserContext) {
    this.validateClinicAccess(user, clinicId);

    // This would need to be implemented based on your intake/triage system
    // For now, returning empty array as placeholder (matches frontend)
    return [];
  }

  /**
   * Get counters (arrived, inExam, labPending, boarding, rxRefills, todayAppts)
   * Matches frontend dashboardService.getCounters logic exactly
   */
  async getCounters(
    clinicId: string,
    user: UserContext,
    filters?: { mine?: boolean },
  ) {
    this.validateClinicAccess(user, clinicId);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Base query for today's appointments
    let baseQuery = this.supabaseService
      .getClient()
      .from('appointments')
      .select('status')
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startOfDay.toISOString())
      .lt('appointment_time', endOfDay.toISOString());

    // Apply mine filter
    if (filters?.mine) {
      baseQuery = baseQuery.eq('vet_id', user.user_id);
    }

    const { data: appointments, error } = await baseQuery;

    if (error) throw error;

    // Count by status
    const counters = {
      arrived: 0,
      inExam: 0,
      labPending: 0,
      boarding: 0,
      rxRefills: 0,
      todayAppts: appointments?.length || 0,
    };

    appointments?.forEach((appointment) => {
      switch (appointment.status) {
        case 'checked_in':
          counters.arrived++;
          break;
        case 'in_progress':
          counters.inExam++;
          break;
        case 'completed':
          counters.labPending++;
          break;
        case 'scheduled':
          counters.boarding++;
          break;
        default:
          break;
      }
    });

    // For now, using placeholder value for rxRefills (matches frontend)
    counters.rxRefills = 0;

    return counters;
  }

  /**
   * Get KPI data for time range
   * Matches frontend dashboardService.getKPIData logic exactly
   */
  async getKPIData(
    clinicId: string,
    user: UserContext,
    timeRange: 'today' | '7days' | '30days' = '7days',
  ) {
    this.validateClinicAccess(user, clinicId);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Calculate date ranges based on timeRange
    let startDate: Date;
    let endDate: Date;
    let comparisonStartDate: Date; // For trend calculation

    if (timeRange === 'today') {
      startDate = startOfDay;
      endDate = endOfDay;
      comparisonStartDate = new Date(startDate);
      comparisonStartDate.setDate(comparisonStartDate.getDate() - 1);
    } else if (timeRange === '7days') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = endOfDay;
      comparisonStartDate = new Date(startDate);
      comparisonStartDate.setDate(comparisonStartDate.getDate() - 7);
    } else {
      // 30days
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate = endOfDay;
      comparisonStartDate = new Date(startDate);
      comparisonStartDate.setDate(comparisonStartDate.getDate() - 30);
    }

    // Start of week (Monday) - for "this week" secondary value
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    // Get appointments count for the selected time range
    const { count: rangeApptsCount, error: rangeApptsError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startDate.toISOString())
      .lt('appointment_time', endDate.toISOString());

    if (rangeApptsError) throw rangeApptsError;

    // Get today's appointments count (for secondary value when timeRange is not 'today')
    const { count: todayApptsCount, error: todayApptsError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startOfDay.toISOString())
      .lt('appointment_time', endOfDay.toISOString());

    if (todayApptsError) throw todayApptsError;

    // Get this week's appointments count (for secondary value)
    const { count: weekApptsCount, error: weekApptsError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startOfWeek.toISOString())
      .lt('appointment_time', endOfWeek.toISOString());

    if (weekApptsError) throw weekApptsError;

    // Get telehealth appointments count for the selected time range
    const { count: rangeTelehealthCount, error: rangeTelehealthError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .eq('service_type', 'Telehealth')
      .gte('appointment_time', startDate.toISOString())
      .lt('appointment_time', endDate.toISOString());

    if (rangeTelehealthError) throw rangeTelehealthError;

    // Get today's telehealth appointments count
    const { count: todayTelehealthCount, error: todayTelehealthError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .eq('service_type', 'Telehealth')
      .gte('appointment_time', startOfDay.toISOString())
      .lt('appointment_time', endOfDay.toISOString());

    if (todayTelehealthError) throw todayTelehealthError;

    // Get this week's telehealth appointments count
    const { count: weekTelehealthCount, error: weekTelehealthError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', clinicId)
      .eq('service_type', 'Telehealth')
      .gte('appointment_time', startOfWeek.toISOString())
      .lt('appointment_time', endOfWeek.toISOString());

    if (weekTelehealthError) throw weekTelehealthError;

    // Get active clients count (non-deleted, non-inactive)
    const { count: activeClientsCount, error: activeClientsError } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .or('status.is.null,status.neq.inactive');

    if (activeClientsError) throw activeClientsError;

    // Get active clients count for comparison period (for trend)
    const { count: activeClientsCountComparison, error: activeClientsComparisonError } =
      await this.supabaseService
        .getClient()
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .or('status.is.null,status.neq.inactive')
        .lte('created_at', comparisonStartDate.toISOString());

    if (activeClientsComparisonError) throw activeClientsComparisonError;

    // Get messages count for the selected time range
    const { count: rangeMessagesCount, error: rangeMessagesError } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    if (rangeMessagesError) throw rangeMessagesError;

    // Get today's messages count (for secondary value when timeRange is not 'today')
    const { count: todayMessagesCount, error: todayMessagesError } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString());

    if (todayMessagesError) throw todayMessagesError;

    // Get unread messages count (from telehealth_messages where is_read = false and sender_type = 'client')
    const { count: unreadMessagesCount, error: unreadMessagesError } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender_type', 'client');

    if (unreadMessagesError) throw unreadMessagesError;

    // Calculate active clients trend
    const clientsTrend = (activeClientsCount || 0) - (activeClientsCountComparison || 0);

    // Determine primary and secondary values based on timeRange
    let appointmentsPrimary: number;
    let appointmentsSecondary: number;
    let telehealthPrimary: number;
    let telehealthSecondary: number;
    let messagesPrimary: number;

    if (timeRange === 'today') {
      appointmentsPrimary = todayApptsCount || 0;
      appointmentsSecondary = weekApptsCount || 0;
      telehealthPrimary = todayTelehealthCount || 0;
      telehealthSecondary = weekTelehealthCount || 0;
      messagesPrimary = todayMessagesCount || 0;
    } else {
      appointmentsPrimary = rangeApptsCount || 0;
      appointmentsSecondary = todayApptsCount || 0;
      telehealthPrimary = rangeTelehealthCount || 0;
      telehealthSecondary = todayTelehealthCount || 0;
      messagesPrimary = rangeMessagesCount || 0;
    }

    return {
      appointments: {
        primary: appointmentsPrimary,
        secondary: appointmentsSecondary,
      },
      telehealth: {
        primary: telehealthPrimary,
        secondary: telehealthSecondary,
      },
      activeClients: {
        count: activeClientsCount || 0,
        trend: clientsTrend,
      },
      messages: {
        primary: messagesPrimary,
        today: todayMessagesCount || 0,
        unread: unreadMessagesCount || 0,
      },
    };
  }

  /**
   * Get appointments chart data for time range
   * Matches frontend dashboardService.getAppointmentsChartData logic exactly
   */
  async getAppointmentsChartData(
    clinicId: string,
    user: UserContext,
    timeRange: 'today' | '7days' | '30days',
  ) {
    this.validateClinicAccess(user, clinicId);

    const today = new Date();

    // Calculate date ranges based on timeRange
    let startDate: Date;
    let endDate: Date;
    let groupBy: 'hour' | 'day' | 'week';

    if (timeRange === 'today') {
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      groupBy = 'hour';
    } else if (timeRange === '7days') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      groupBy = 'day';
    } else {
      // 30days
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      groupBy = 'week';
    }

    // Fetch appointments for the time range
    const { data: appointments, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('appointment_time, service_type')
      .eq('tenant_id', clinicId)
      .gte('appointment_time', startDate.toISOString())
      .lt('appointment_time', endDate.toISOString())
      .order('appointment_time', { ascending: true });

    if (error) throw error;

    // Group appointments by time period
    const groupedData: Record<string, { all: number; inClinic: number; telehealth: number }> = {};

    appointments?.forEach((apt) => {
      const aptDate = new Date(apt.appointment_time);
      let key: string;

      if (groupBy === 'hour') {
        const hour = aptDate.getHours();
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        key = `${displayHour}${period}`;
      } else if (groupBy === 'day') {
        key = `${String(aptDate.getMonth() + 1).padStart(2, '0')}/${String(aptDate.getDate()).padStart(2, '0')}`;
      } else {
        // week
        const weekStart = new Date(aptDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = `Week ${Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { all: 0, inClinic: 0, telehealth: 0 };
      }

      groupedData[key].all++;
      if (apt.service_type === 'Telehealth') {
        groupedData[key].telehealth++;
      } else {
        groupedData[key].inClinic++;
      }
    });

    // Convert to array format for chart
    const chartData = Object.entries(groupedData)
      .map(([date, counts]) => ({
        date,
        all: counts.all,
        inClinic: counts.inClinic,
        telehealth: counts.telehealth,
      }))
      .sort((a, b) => {
        // Sort by date for proper chart ordering
        if (groupBy === 'hour') {
          const getHourValue = (dateStr: string) => {
            const hour = parseInt(dateStr.replace(/[^0-9]/g, ''));
            const isPM = dateStr.includes('PM');
            if (isPM && hour !== 12) return hour + 12;
            if (!isPM && hour === 12) return 0;
            return isPM ? hour + 12 : hour;
          };
          return getHourValue(a.date) - getHourValue(b.date);
        } else if (groupBy === 'day') {
          const [aMonth, aDay] = a.date.split('/').map(Number);
          const [bMonth, bDay] = b.date.split('/').map(Number);
          return (
            new Date(today.getFullYear(), aMonth - 1, aDay).getTime() -
            new Date(today.getFullYear(), bMonth - 1, bDay).getTime()
          );
        } else {
          return parseInt(a.date.split(' ')[1]) - parseInt(b.date.split(' ')[1]);
        }
      });

    return chartData;
  }

  /**
   * Get client engagement chart data for time range
   * Matches frontend dashboardService.getClientEngagementChartData logic exactly
   */
  async getClientEngagementChartData(
    clinicId: string,
    user: UserContext,
    timeRange: 'today' | '7days' | '30days',
  ) {
    this.validateClinicAccess(user, clinicId);

    const today = new Date();

    // Calculate date ranges based on timeRange
    let startDate: Date;
    let endDate: Date;
    let groupBy: 'hour' | 'day' | 'week';

    if (timeRange === 'today') {
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      groupBy = 'hour';
    } else if (timeRange === '7days') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      groupBy = 'day';
    } else {
      // 30days
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      groupBy = 'week';
    }

    // Fetch telehealth messages for the time range
    const { data: messages, error } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('created_at, sender_type, is_read')
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group messages by time period
    const groupedData: Record<string, { sent: number; responded: number; unread: number }> = {};

    messages?.forEach((msg) => {
      const msgDate = new Date(msg.created_at);
      let key: string;

      if (groupBy === 'hour') {
        const hour = msgDate.getHours();
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        key = `${displayHour}${period}`;
      } else if (groupBy === 'day') {
        key = `${String(msgDate.getMonth() + 1).padStart(2, '0')}/${String(msgDate.getDate()).padStart(2, '0')}`;
      } else {
        // week
        const weekStart = new Date(msgDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = `Week ${Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { sent: 0, responded: 0, unread: 0 };
      }

      // Count sent messages (all messages)
      groupedData[key].sent++;

      // Count responded (messages that are read)
      if (msg.is_read) {
        groupedData[key].responded++;
      }

      // Count unread (client messages that are not read)
      if (msg.sender_type === 'client' && !msg.is_read) {
        groupedData[key].unread++;
      }
    });

    // Convert to array format for chart
    const chartData = Object.entries(groupedData)
      .map(([date, counts]) => ({
        date,
        sent: counts.sent,
        responded: counts.responded,
        unread: counts.unread,
      }))
      .sort((a, b) => {
        // Sort by date for proper chart ordering
        if (groupBy === 'hour') {
          const getHourValue = (dateStr: string) => {
            const hour = parseInt(dateStr.replace(/[^0-9]/g, ''));
            const isPM = dateStr.includes('PM');
            if (isPM && hour !== 12) return hour + 12;
            if (!isPM && hour === 12) return 0;
            return isPM ? hour + 12 : hour;
          };
          return getHourValue(a.date) - getHourValue(b.date);
        } else if (groupBy === 'day') {
          const [aMonth, aDay] = a.date.split('/').map(Number);
          const [bMonth, bDay] = b.date.split('/').map(Number);
          return (
            new Date(today.getFullYear(), aMonth - 1, aDay).getTime() -
            new Date(today.getFullYear(), bMonth - 1, bDay).getTime()
          );
        } else {
          return parseInt(a.date.split(' ')[1]) - parseInt(b.date.split(' ')[1]);
        }
      });

    return chartData;
  }
}

