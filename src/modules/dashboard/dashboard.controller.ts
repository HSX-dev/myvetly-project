import { Controller, Get, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('clinic/:clinicId')
  getClinicDashboard(@Param('clinicId') clinicId: string) {
    return this.dashboardService.getClinicDashboard(clinicId);
  }
}

