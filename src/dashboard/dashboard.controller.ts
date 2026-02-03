import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { GetUser } from '../utils/decorators/get-user.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('clinic/:clinicId')
  getClinicDashboard(@Param('clinicId') clinicId: string) {
    return this.dashboardService.getClinicDashboard(clinicId);
  }

  @Get('clinic/:clinicId/todays-appointments')
  getTodaysAppointments(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('mine') mine?: string,
    @Query('status') status?: string,
  ) {
    return this.dashboardService.getTodaysAppointments(clinicId, user, {
      mine: mine === 'true',
      status,
    });
  }

  @Get('clinic/:clinicId/unread-messages')
  getUnreadMessages(@Param('clinicId') clinicId: string, @GetUser() user: UserContext) {
    return this.dashboardService.getUnreadMessages(clinicId, user);
  }

  @Get('clinic/:clinicId/alerts')
  getAlerts(@Param('clinicId') clinicId: string, @GetUser() user: UserContext) {
    return this.dashboardService.getAlerts(clinicId, user);
  }

  @Get('clinic/:clinicId/tasks')
  getTasks(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('scope') scope?: 'all' | 'mine',
    @Query('search') search?: string,
  ) {
    return this.dashboardService.getTasks(clinicId, user, { scope, search });
  }

  @Get('clinic/:clinicId/intake-queue')
  getIntakeQueue(@Param('clinicId') clinicId: string, @GetUser() user: UserContext) {
    return this.dashboardService.getIntakeQueue(clinicId, user);
  }

  @Get('clinic/:clinicId/counters')
  getCounters(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('mine') mine?: string,
  ) {
    return this.dashboardService.getCounters(clinicId, user, { mine: mine === 'true' });
  }

  @Get('clinic/:clinicId/kpi')
  getKPIData(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('timeRange') timeRange: 'today' | '7days' | '30days' = '7days',
  ) {
    return this.dashboardService.getKPIData(clinicId, user, timeRange);
  }

  @Get('clinic/:clinicId/appointments-chart')
  getAppointmentsChartData(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('timeRange') timeRange: 'today' | '7days' | '30days' = '7days',
  ) {
    return this.dashboardService.getAppointmentsChartData(clinicId, user, timeRange);
  }

  @Get('clinic/:clinicId/engagement-chart')
  getClientEngagementChartData(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('timeRange') timeRange: 'today' | '7days' | '30days' = '7days',
  ) {
    return this.dashboardService.getClientEngagementChartData(clinicId, user, timeRange);
  }
}

