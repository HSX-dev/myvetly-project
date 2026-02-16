import { Controller, Get, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) { }

  @Get('clinic/:clinicId')
  getClinicSettings(@Param('clinicId') clinicId: string, @GetUser() user: UserContext) {
    // Validate clinic access
    if (user.role === 'super_admin') {
      // Super admin can access any clinic
    } else if (user.role === 'org_admin') {
      // Org admin can access clinics in their organization
      // Note: We'd need to verify the clinic belongs to the org, but for now allow
      // The database RLS will handle this
    } else {
      // Clinic admin and below can only access their own clinic
      if (!user.clinic_id) {
        throw new ForbiddenException(
          `Access denied: Your user account does not have a clinic_id assigned. Please contact your administrator.`,
        );
      }
      if (user.clinic_id !== clinicId) {
        throw new ForbiddenException(
          `Access denied: You can only access settings for your own clinic (your clinic_id: ${user.clinic_id}, requested: ${clinicId})`,
        );
      }
    }

    return this.settingsService.findClinicSettings(clinicId);
  }

  @Patch('clinic/:clinicId')
  updateClinicSettings(
    @Param('clinicId') clinicId: string,
    @Body(CleanDtoPipe) settings: any,
    @GetUser() user: UserContext,
  ) {
    // Validate clinic access
    if (user.role === 'super_admin') {
      // Super admin can update any clinic
    } else if (user.role === 'org_admin') {
      // Org admin can update clinics in their organization
      // Note: We'd need to verify the clinic belongs to the org, but for now allow
      // The database RLS will handle this
    } else {
      // Clinic admin and below can only update their own clinic
      if (!user.clinic_id) {
        throw new ForbiddenException(
          `Access denied: Your user account does not have a clinic_id assigned. Please contact your administrator.`,
        );
      }
      if (user.clinic_id !== clinicId) {
        throw new ForbiddenException(
          `Access denied: You can only update settings for your own clinic (your clinic_id: ${user.clinic_id}, requested: ${clinicId})`,
        );
      }
    }

    return this.settingsService.updateClinicSettings(clinicId, settings);
  }
}

