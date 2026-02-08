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
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto, SendConfirmationEmailDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createAppointmentDto: CreateAppointmentDto, @GetUser() user: any) {
    return this.appointmentsService.create(createAppointmentDto, user);
  }

  @Get()
  findAll() {
    return this.appointmentsService.findAll();
  }

  // More specific route must come BEFORE less specific route
  @Get('clinic/:clinicId/status/:status')
  findByStatus(
    @Param('clinicId') clinicId: string,
    @Param('status') status: 'requested' | 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
  ) {
    return this.appointmentsService.findByStatus(clinicId, status);
  }

  @Get('clinic/:clinicId')
  findByClinic(
    @Param('clinicId') clinicId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.appointmentsService.findByClinic(clinicId, startDate, endDate);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.appointmentsService.findByPet(petId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateAppointmentDto: UpdateAppointmentDto,
    @GetUser() user: any,
  ) {
    return this.appointmentsService.update(id, updateAppointmentDto, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body('status') status: 'requested' | 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
    @Body('vetId') vetId?: string,
    @Body('notes') notes?: string,
  ) {
    return this.appointmentsService.updateStatus(id, status, user, vetId, notes);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.appointmentsService.remove(id, user);
  }

  @Post('send-confirmation-email')
  @HttpCode(HttpStatus.OK)
  sendConfirmationEmail(@Body(CleanDtoPipe) sendConfirmationDto: SendConfirmationEmailDto) {
    return this.appointmentsService.sendConfirmationEmail(sendConfirmationDto);
  }
}

