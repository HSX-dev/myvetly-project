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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, CreateUserScheduleDto, UpdateUserScheduleDto } from './dto';
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
}

