import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdatePasswordDto, CreateUserScheduleDto, UpdateUserScheduleDto } from './dto';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createUserDto: CreateUserDto, @GetUser() user: any) {
    return this.usersService.create(createUserDto, user);
  }

  @Get()
  findAll(@GetUser() user: any) {
    return this.usersService.findAll(user);
  }

  @Get('me')
  getCurrentUser(@GetUser() user: any) {
    return this.usersService.getCurrentUserProfile(user);
  }

  @Get('organization')
  findByOrganization(@GetUser() user: any) {
    return this.usersService.findByOrganization(user);
  }

  @Get('deleted')
  findAllIncludingDeleted(@GetUser() user: any) {
    return this.usersService.findAllIncludingDeleted(user);
  }

  @Get('schedules/clinic/:clinicId')
  getUserSchedules(@Param('clinicId') clinicId: string, @GetUser() user: any) {
    return this.usersService.getUserSchedules(clinicId, user);
  }

  @Get('veterinarians/clinic/:clinicId')
  getVeterinarians(@Param('clinicId') clinicId: string, @GetUser() user: any) {
    return this.usersService.getVeterinarians(clinicId, user);
  }

  @Get('states')
  getStates() {
    return this.usersService.getStates();
  }

  @Get('email/:email')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('auth-user/:authUserId')
  findByAuthUserId(@Param('authUserId') authUserId: string, @GetUser() user: any) {
    // Verify that the requested authUserId matches the authenticated user
    if (user.auth_user_id !== authUserId) {
      throw new ForbiddenException('Access denied: Cannot fetch other users by auth_user_id');
    }
    return this.usersService.findByAuthUserId(authUserId);
  }

  @Post('schedules/:userId')
  @HttpCode(HttpStatus.CREATED)
  createUserSchedule(
    @Param('userId') userId: string,
    @Body(CleanDtoPipe) createScheduleDto: CreateUserScheduleDto,
    @GetUser() user: any,
  ) {
    return this.usersService.createUserSchedule(userId, createScheduleDto, user);
  }

  @Patch('schedules/:scheduleId')
  updateUserSchedule(
    @Param('scheduleId') scheduleId: string,
    @Body(CleanDtoPipe) updateScheduleDto: UpdateUserScheduleDto,
    @GetUser() user: any,
  ) {
    return this.usersService.updateUserSchedule(scheduleId, updateScheduleDto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateUserDto: UpdateUserDto,
    @GetUser() user: any,
  ) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.OK)
  updatePassword(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updatePasswordDto: UpdatePasswordDto,
    @GetUser() user: any,
  ) {
    return this.usersService.updatePassword(id, updatePasswordDto.new_password, user);
  }

  @Post('bulk/delete')
  @HttpCode(HttpStatus.OK)
  bulkRemove(@Body('userIds') userIds: string[], @GetUser() user: any) {
    return this.usersService.bulkRemove(userIds, user);
  }

  @Post('bulk/update')
  @HttpCode(HttpStatus.OK)
  bulkUpdate(
    @Body('userIds') userIds: string[],
    @Body('updateData') updateData: UpdateUserDto,
    @GetUser() user: any,
  ) {
    return this.usersService.bulkUpdate(userIds, updateData, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.usersService.remove(id, user);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id') id: string, @GetUser() user: any) {
    return this.usersService.restore(id, user);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  hardDelete(@Param('id') id: string, @GetUser() user: any) {
    return this.usersService.hardDelete(id, user);
  }

  @Get(':id/licensed-states')
  getUserLicensedStates(@Param('id') id: string, @GetUser() user: any) {
    return this.usersService.getUserLicensedStates(id, user);
  }

  @Patch(':id/licensed-states')
  @HttpCode(HttpStatus.OK)
  updateUserLicensedStates(
    @Param('id') id: string,
    @Body('stateIds') stateIds: string[],
    @GetUser() user: any,
  ) {
    return this.usersService.updateUserLicensedStates(id, stateIds, user);
  }
}

