import { Controller, Get, Param, Post, Body, Patch, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateClinicUserRoleDto } from './dto/create-clinic-user-role.dto';
import { UpdateClinicUserRoleDto } from './dto/update-clinic-user-role.dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';
import { GetUser } from '../utils/decorators/get-user.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  // More specific routes must come before parameterized routes
  @Get('clinic/:clinicId/user-roles')
  getClinicUserRolesByClinicId(
    @Param('clinicId') clinicId: string,
    @GetUser() user: UserContext,
  ) {
    return this.rolesService.getClinicUserRolesByClinicId(clinicId, user);
  }

  @Get('clinic/:clinicId')
  findByClinic(@Param('clinicId') clinicId: string) {
    return this.rolesService.findByClinic(clinicId);
  }

  @Get('user-roles/:id')
  getClinicUserRole(
    @Param('id') id: string,
    @GetUser() user: UserContext,
  ) {
    return this.rolesService.getClinicUserRole(id, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post('user-roles')
  @HttpCode(HttpStatus.CREATED)
  createClinicUserRole(
    @Body(CleanDtoPipe) createDto: CreateClinicUserRoleDto,
    @GetUser() user: UserContext,
  ) {
    return this.rolesService.createClinicUserRole(createDto, user);
  }

  @Patch('user-roles/:id')
  updateClinicUserRole(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateDto: UpdateClinicUserRoleDto,
    @GetUser() user: UserContext,
  ) {
    return this.rolesService.updateClinicUserRole(id, updateDto, user);
  }

  @Delete('user-roles/:id')
  @HttpCode(HttpStatus.OK)
  deleteClinicUserRole(
    @Param('id') id: string,
    @GetUser() user: UserContext,
  ) {
    return this.rolesService.deleteClinicUserRole(id, user);
  }
}

