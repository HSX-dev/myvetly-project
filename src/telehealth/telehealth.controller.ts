import { Controller, Get, Param } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';

@Controller('telehealth')
export class TelehealthController {
  constructor(private readonly telehealthService: TelehealthService) {}

  @Get()
  findAll() {
    return this.telehealthService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.telehealthService.findOne(id);
  }

  @Get('appointment/:appointmentId')
  findByAppointment(@Param('appointmentId') appointmentId: string) {
    return this.telehealthService.findByAppointment(appointmentId);
  }
}

