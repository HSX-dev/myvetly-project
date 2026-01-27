import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('clinic/:clinicId')
  getClinicSettings(@Param('clinicId') clinicId: string) {
    return this.settingsService.findClinicSettings(clinicId);
  }

  @Patch('clinic/:clinicId')
  updateClinicSettings(
    @Param('clinicId') clinicId: string,
    @Body(CleanDtoPipe) settings: any,
  ) {
    return this.settingsService.updateClinicSettings(clinicId, settings);
  }
}

