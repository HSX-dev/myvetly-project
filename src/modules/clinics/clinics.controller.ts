import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto, UpdateClinicDto, CreateClinicServiceDto, UpdateClinicServiceDto } from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { GetUser } from '../../utils/decorators/get-user.decorator';

@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createClinicDto: CreateClinicDto) {
    return this.clinicsService.create(createClinicDto);
  }

  @Get()
  findAll(@Query('organization_id') organizationId?: string) {
    return this.clinicsService.findAll(organizationId);
  }

  // More specific routes must come before parameterized routes
  @Get(':id/branding')
  getBranding(@Param('id') id: string, @GetUser() user: any) {
    console.log('getBranding called with id:', id, 'user:', user?.id);
    return this.clinicsService.getBranding(id, user);
  }

  @Get(':id/user-roles')
  getUserRoles(@Param('id') id: string, @GetUser() user: any) {
    return this.clinicsService.getUserRolesByClinic(id, user);
  }

  @Get(':id/users')
  getUsers(@Param('id') id: string, @GetUser() user: any) {
    return this.clinicsService.getUsersByClinic(id, user);
  }

  @Get(':id/services')
  getClinicServices(
    @Param('id') id: string,
    @GetUser() user: any,
    @Query('active') active?: string,
  ) {
    const getActive = active === 'true';
    return this.clinicsService.getClinicServices(id, getActive, user);
  }

  @Get(':id/service-names')
  getServiceNames(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.clinicsService.getServiceNames(id, undefined, user);
  }

  @Post(':id/services')
  @HttpCode(HttpStatus.CREATED)
  createClinicService(
    @Param('id') id: string,
    @Body(CleanDtoPipe) createServiceDto: CreateClinicServiceDto,
    @GetUser() user: any,
  ) {
    return this.clinicsService.createClinicService(id, createServiceDto, user);
  }

  @Patch('services/:serviceId')
  updateClinicService(
    @Param('serviceId') serviceId: string,
    @Body(CleanDtoPipe) updateServiceDto: UpdateClinicServiceDto,
    @GetUser() user: any,
  ) {
    return this.clinicsService.updateClinicService(serviceId, updateServiceDto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.clinicsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateClinicDto: UpdateClinicDto,
    @GetUser() user: any,
  ) {
    return this.clinicsService.update(id, updateClinicDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clinicsService.remove(id);
  }
}

