import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
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

  @Get('body-maps/:id')
  getBodyMapById(@Param('id') id: string, @GetUser() user: UserContext) {
    return this.soapService.getBodyMapById(id, user);
  }

  @Post('body-maps')
  createBodyMap(@Body() data: any, @GetUser() user: UserContext) {
    return this.soapService.createBodyMap(data, user);
  }

  @Patch('body-maps/:id')
  updateBodyMap(@Param('id') id: string, @Body() data: any, @GetUser() user: UserContext) {
    return this.soapService.updateBodyMap(id, data, user);
  }

  @Delete('body-maps/:id')
  deleteBodyMap(@Param('id') id: string, @GetUser() user: UserContext) {
    return this.soapService.deleteBodyMap(id, user);
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

  @Post('expand/:soapNoteId')
  expandSOAP(
    @Param('soapNoteId') soapNoteId: string,
    @Body() body: { section?: string; current_data?: any },
    @GetUser() user: UserContext,
  ) {
    const validSections = ['subjective', 'objective', 'assessment', 'plan', 'all'];
    const section = body.section && validSections.includes(body.section)
      ? (body.section as 'subjective' | 'objective' | 'assessment' | 'plan' | 'all')
      : undefined;
    return this.soapService.expandSOAP(soapNoteId, section, body.current_data, user);
  }

  @Post('undo-expand/:soapNoteId')
  undoSOAPExpand(@Param('soapNoteId') soapNoteId: string, @GetUser() user: UserContext) {
    return this.soapService.undoSOAPExpand(soapNoteId, user);
  }

  @Get('pet/:petId/full')
  getSoapNoteByPet(@Param('petId') petId: string, @GetUser() user: UserContext) {
    return this.soapService.getSoapNoteByPet(petId, user);
  }

  @Get('body-maps/storage/base-image-url/:species')
  getBaseImageUrl(@Param('species') species: string, @GetUser() user: UserContext) {
    return this.soapService.getBaseImageUrl(species, user);
  }

  @Get('body-maps/storage/signed-url/:species')
  getSignedBaseImageUrl(
    @Param('species') species: string,
    @GetUser() user: UserContext,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const expiresInSeconds = expiresIn ? parseInt(expiresIn, 10) : 3600;
    return this.soapService.getSignedBaseImageUrl(species, user, expiresInSeconds);
  }

  @Get('body-maps/storage/list/:folder')
  listStorageFiles(
    @Param('folder') folder: string,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.listStorageFiles(folder, user);
  }

  @Get('body-maps/storage/verify/:species')
  verifyImageExists(@Param('species') species: string, @GetUser() user: UserContext) {
    return this.soapService.verifyImageExists(species, user);
  }

  @Get('discharge-instructions/storage/public-url')
  getDischargeInstructionsPublicUrl(
    @Query('filePath') filePath: string,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.getDischargeInstructionsPublicUrl(filePath, user);
  }

  @Post('body-maps/storage/upload-thumbnail')
  uploadBodyMapThumbnail(
    @Body() body: { soapNoteId: string; bodyMapId: string; fileData: string },
    @GetUser() user: UserContext,
  ) {
    return this.soapService.uploadBodyMapThumbnail(
      body.soapNoteId,
      body.bodyMapId,
      body.fileData,
      user,
    );
  }

  @Delete('body-maps/storage/remove-thumbnail')
  removeBodyMapThumbnail(
    @Query('filePath') filePath: string,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.removeBodyMapThumbnail(filePath, user);
  }

  // SOAP Vitals endpoints
  @Post('vitals/:soapNoteId')
  createSoapVitals(
    @Param('soapNoteId') soapNoteId: string,
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.createSoapVitals(data, soapNoteId, user);
  }

  @Patch('vitals/:id')
  updateSoapVitals(
    @Param('id') id: string,
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.updateSoapVitals(id, data, user);
  }

  // SOAP Physical Exam endpoints
  @Post('physical/:soapNoteId')
  createSoapPhysicalExam(
    @Param('soapNoteId') soapNoteId: string,
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.createSoapPhysicalExam(data, soapNoteId, user);
  }

  @Patch('physical/:id')
  updateSoapPhysicalExam(
    @Param('id') id: string,
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.updateSoapPhysicalExam(id, data, user);
  }

  // Treatment Plan endpoints
  @Post('treatment-plans')
  createTreatmentPlan(
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.createTreatmentPlan(data, user);
  }

  @Patch('treatment-plans/:id/status')
  updateTreatmentPlanStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @GetUser() user: UserContext,
  ) {
    return this.soapService.updateTreatmentPlanStatus(id, body.status, user);
  }

  // Discharge Instructions endpoints
  @Post('discharge-instructions')
  createDischargeInstructions(
    @Body() data: any,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.createDischargeInstructions(data, user);
  }

  @Get('discharge-instructions/appointment/:appointmentId')
  getDischargeInstructionsByAppointment(
    @Param('appointmentId') appointmentId: string,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.getDischargeInstructionsByAppointment(appointmentId, user);
  }

  @Patch('discharge-instructions/:id/mark-provided')
  markDischargeInstructionsProvided(
    @Param('id') id: string,
    @GetUser() user: UserContext,
  ) {
    return this.soapService.markDischargeInstructionsProvided(id, user);
  }

  @Post('discharge-instructions/upload')
  uploadDischargeInstructionsFile(
    @Body() body: {
      appointmentId: string;
      filePath: string;
      fileData: string; // base64 encoded
      contentType: string;
    },
    @GetUser() user: UserContext,
  ) {
    return this.soapService.uploadDischargeInstructionsFile(
      body.appointmentId,
      body.filePath,
      body.fileData,
      body.contentType,
      user,
    );
  }

  // This must come AFTER all more specific routes
  @Get(':id')
  getSoapNoteById(@Param('id') id: string, @GetUser() user: UserContext) {
    return this.soapService.getSoapNoteById(id, user);
  }
}

