import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { SoapService } from './soap.service';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { UserContext } from '../auth/auth.guard';

@Controller('soap')
@UseGuards(AuthGuard)
export class SoapController {
  constructor(private readonly soapService: SoapService) {}

  // More specific routes must come before generic parameterized routes
  @Get('pet/:petId/audit/latest')
  getSOAPAuditLatest(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPAuditLatest(petId, user);
  }

  @Get('pet/:petId/audit')
  getSOAPAudit(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPAudit(petId, user);
  }

  @Get('pet/:petId')
  getSOAPByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPByPet(petId, user);
  }

  @Get('appointment/:appointmentId')
  getSOAPByAppointment(@Param('appointmentId') appointmentId: string, @GetUser() user: any) {
    return this.soapService.getSOAPByAppointment(appointmentId, user);
  }

  @Get('treatment-plans/soap/:soapNoteId')
  getTreatmentPlansBySoapNote(@Param('soapNoteId') soapNoteId: string, @GetUser() user: any) {
    return this.soapService.getTreatmentPlansBySoapNote(soapNoteId, user);
  }

  @Get('body-maps/soap/:soapNoteId')
  getBodyMapsBySoapNote(@Param('soapNoteId') soapNoteId: string, @GetUser() user: any) {
    return this.soapService.getBodyMapsBySoapNote(soapNoteId, user);
  }

  @Post()
  createSoapNote(@Body() data: any, @GetUser() user: UserContext) {
    return this.soapService.createSoapNote(data, user);
  }

  @Patch(':id')
  updateSoapNote(@Param('id') id: string, @Body() data: any, @GetUser() user: UserContext) {
    return this.soapService.updateSoapNote(id, data, user);
  }

  @Get('has-active-expansion/:soapNoteId')
  hasActiveExpansion(@Param('soapNoteId') soapNoteId: string, @GetUser() user: UserContext) {
    return this.soapService.hasActiveExpansion(soapNoteId, user);
  }

  @Get('pet/:petId/full')
  getSoapNoteByPet(@Param('petId') petId: string, @GetUser() user: UserContext) {
    return this.soapService.getSoapNoteByPet(petId, user);
  }

  // This must come AFTER all more specific routes
  @Get(':id')
  getSoapNoteById(@Param('id') id: string, @GetUser() user: UserContext) {
    return this.soapService.getSoapNoteById(id, user);
  }
}

