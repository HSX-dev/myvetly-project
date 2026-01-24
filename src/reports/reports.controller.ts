import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('clinic/:clinicId/stats')
  getClinicStats(
    @Param('clinicId') clinicId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getClinicStats(clinicId, startDate, endDate);
  }

  @Get('pet/:petId')
  getPetReports(@Param('petId') petId: string) {
    return this.reportsService.getPetReports(petId);
  }
}

