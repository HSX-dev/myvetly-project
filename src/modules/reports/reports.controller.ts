import { Controller, Get, Param, Query, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../auth/auth.guard';
import type { UserContext } from '../auth/auth.guard';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import { ReportFiltersDto } from './dto/report-filters.dto';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Get('clinic/:clinicId/stats')
  getClinicStats(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getClinicStats(clinicId, startDate, endDate, user);
  }

  @Get('pet/:petId')
  getPetReports(@Param('petId') petId: string) {
    return this.reportsService.getPetReports(petId);
  }

  /**
   * Get Clients Report
   * GET /api/reports/clients
   */
  @Get('clients')
  getClientsReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getClientsReport(filters, req.user);
  }

  /**
   * Get Patients Report
   * GET /api/reports/patients
   */
  @Get('patients')
  getPatientsReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getPatientsReport(filters, req.user);
  }

  /**
   * Get Appointments Report
   * GET /api/reports/appointments
   */
  @Get('appointments')
  getAppointmentsReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getAppointmentsReport(filters, req.user);
  }

  /**
   * Get Telehealth Sessions Report
   * GET /api/reports/telehealth
   */
  @Get('telehealth')
  getTelehealthSessionsReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getTelehealthSessionsReport(filters, req.user);
  }

  /**
   * Get Messages Report
   * GET /api/reports/messages
   */
  @Get('messages')
  getMessagesReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getMessagesReport(filters, req.user);
  }

  /**
   * Get Services Report
   * GET /api/reports/services
   */
  @Get('services')
  getServicesReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getServicesReport(filters, req.user);
  }

  /**
   * Get Tasks Report
   * GET /api/reports/tasks
   */
  @Get('tasks')
  getTasksReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getTasksReport(filters, req.user);
  }

  /**
   * Get Financial Report
   * GET /api/reports/financial
   */
  @Get('financial')
  getFinancialReport(
    @Query() filters: ReportFiltersDto,
    @Request() req: { user: UserContext },
  ) {
    return this.reportsService.getFinancialReport(filters, req.user);
  }

  /**
   * Get unique service types for filter options
   * GET /api/reports/service-types
   */
  @Get('service-types')
  getServiceTypes(
    @Request() req: { user: UserContext },
    @Query('clinicId') clinicId?: string,
  ) {
    const finalClinicId = clinicId || req.user.clinic_id;
    if (!finalClinicId) {
      return [];
    }
    return this.reportsService.getServiceTypes(finalClinicId);
  }
}

