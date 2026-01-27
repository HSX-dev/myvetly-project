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
  UseGuards,
  Request,
} from '@nestjs/common';
import { WhiteboardService } from './whiteboard.service';
import {
  GetWhiteboardPatientsDto,
  AddPatientToWhiteboardDto,
  UpdateWhiteboardPatientDto,
  ScheduleTreatmentDto,
  UpdateTreatmentDto,
  CompleteTreatmentDto,
  AssignTaskDto,
  ScheduleProcedureDto,
  UpdateProcedureStatusDto,
  CreateLocationDto,
  CreateHandoverNoteDto,
  RejectInvoiceItemDto,
} from './dto/index';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('whiteboard')
@UseGuards(AuthGuard)
export class WhiteboardController {
  constructor(private readonly whiteboardService: WhiteboardService) {}

  /**
   * Get all whiteboard patients for a clinic on a given date
   * GET /api/whiteboard/clinic/:clinicId/patients
   */
  @Get('clinic/:clinicId/patients')
  getWhiteboardPatients(
    @Param('clinicId') clinicId: string,
    @Query('date') date: string,
    @Query() filters: GetWhiteboardPatientsDto,
    @Request() req: { user: UserContext },
  ) {
    const dateObj = date ? new Date(date) : new Date();
    return this.whiteboardService.getWhiteboardPatients(clinicId, dateObj, filters, req.user);
  }

  /**
   * Add patient to whiteboard
   * POST /api/whiteboard/patients
   */
  @Post('patients')
  @HttpCode(HttpStatus.CREATED)
  addPatientToWhiteboard(
    @Body(CleanDtoPipe) addPatientDto: AddPatientToWhiteboardDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.addPatientToWhiteboard(addPatientDto, req.user);
  }

  /**
   * Get patient details with treatments and tasks
   * GET /api/whiteboard/patients/:id
   */
  @Get('patients/:id')
  getPatientDetails(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.getPatientDetails(id, req.user);
  }

  /**
   * Update whiteboard patient
   * PATCH /api/whiteboard/patients/:id
   */
  @Patch('patients/:id')
  updateWhiteboardPatient(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateDto: UpdateWhiteboardPatientDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.updateWhiteboardPatient(id, updateDto, req.user);
  }

  /**
   * Remove/discharge patient from whiteboard
   * DELETE /api/whiteboard/patients/:id
   */
  @Delete('patients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePatientFromWhiteboard(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.removePatientFromWhiteboard(id, req.user);
  }

  /**
   * Schedule treatment
   * POST /api/whiteboard/patients/:patientId/treatments
   */
  @Post('patients/:patientId/treatments')
  @HttpCode(HttpStatus.CREATED)
  scheduleTreatment(
    @Param('patientId') patientId: string,
    @Body(CleanDtoPipe) scheduleTreatmentDto: ScheduleTreatmentDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.scheduleTreatment(patientId, scheduleTreatmentDto, req.user);
  }

  /**
   * Update treatment
   * PATCH /api/whiteboard/treatments/:id
   */
  @Patch('treatments/:id')
  updateTreatment(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateTreatmentDto: UpdateTreatmentDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.updateTreatment(id, updateTreatmentDto, req.user);
  }

  /**
   * Complete treatment
   * POST /api/whiteboard/treatments/:id/complete
   */
  @Post('treatments/:id/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  completeTreatment(
    @Param('id') id: string,
    @Body(CleanDtoPipe) completeTreatmentDto: CompleteTreatmentDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.completeTreatment(id, completeTreatmentDto, req.user);
  }

  /**
   * Get due treatments
   * GET /api/whiteboard/clinic/:clinicId/treatments/due
   */
  @Get('clinic/:clinicId/treatments/due')
  getDueTreatments(
    @Param('clinicId') clinicId: string,
    @Query('date') date: string,
    @Query('assignedToUserId') assignedToUserId: string | undefined,
    @Request() req: { user: UserContext },
  ) {
    const dateObj = date ? new Date(date) : new Date();
    return this.whiteboardService.getDueTreatments(clinicId, dateObj, assignedToUserId, req.user);
  }

  /**
   * Get overdue treatments
   * GET /api/whiteboard/clinic/:clinicId/treatments/overdue
   */
  @Get('clinic/:clinicId/treatments/overdue')
  getOverdueTreatments(
    @Param('clinicId') clinicId: string,
    @Query('date') date: string,
    @Query('assignedToUserId') assignedToUserId: string | undefined,
    @Request() req: { user: UserContext },
  ) {
    const dateObj = date ? new Date(date) : new Date();
    return this.whiteboardService.getOverdueTreatments(clinicId, dateObj, assignedToUserId, req.user);
  }

  /**
   * Assign task
   * POST /api/whiteboard/patients/:patientId/tasks
   */
  @Post('patients/:patientId/tasks')
  @HttpCode(HttpStatus.CREATED)
  assignTask(
    @Param('patientId') patientId: string,
    @Body(CleanDtoPipe) assignTaskDto: AssignTaskDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.assignTask(patientId, assignTaskDto, req.user);
  }

  /**
   * Complete task
   * POST /api/whiteboard/tasks/:id/complete
   */
  @Post('tasks/:id/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  completeTask(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.completeTask(id, req.user);
  }

  /**
   * Get whiteboard locations
   * GET /api/whiteboard/clinic/:clinicId/locations
   */
  @Get('clinic/:clinicId/locations')
  getWhiteboardLocations(@Param('clinicId') clinicId: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.getWhiteboardLocations(clinicId, req.user);
  }

  /**
   * Create location
   * POST /api/whiteboard/clinic/:clinicId/locations
   */
  @Post('clinic/:clinicId/locations')
  @HttpCode(HttpStatus.CREATED)
  createLocation(
    @Param('clinicId') clinicId: string,
    @Body(CleanDtoPipe) createLocationDto: CreateLocationDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.createLocation(clinicId, createLocationDto, req.user);
  }

  /**
   * Get audit log
   * GET /api/whiteboard/patients/:patientId/audit-log
   */
  @Get('patients/:patientId/audit-log')
  getAuditLog(@Param('patientId') patientId: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.getAuditLog(patientId, req.user);
  }

  /**
   * Schedule procedure
   * POST /api/whiteboard/patients/:patientId/procedures
   */
  @Post('patients/:patientId/procedures')
  @HttpCode(HttpStatus.CREATED)
  scheduleProcedure(
    @Param('patientId') patientId: string,
    @Body(CleanDtoPipe) scheduleProcedureDto: ScheduleProcedureDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.scheduleProcedure(patientId, scheduleProcedureDto, req.user);
  }

  /**
   * Update procedure status
   * PATCH /api/whiteboard/treatments/:id/procedure-status
   */
  @Patch('treatments/:id/procedure-status')
  updateProcedureStatus(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateProcedureStatusDto: UpdateProcedureStatusDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.updateProcedureStatus(id, updateProcedureStatusDto, req.user);
  }

  /**
   * Get pending invoice items
   * GET /api/whiteboard/clinic/:clinicId/invoice-items/pending
   */
  @Get('clinic/:clinicId/invoice-items/pending')
  getPendingInvoiceItems(
    @Param('clinicId') clinicId: string,
    @Query('appointmentId') appointmentId: string | undefined,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.getPendingInvoiceItems(clinicId, appointmentId, req.user);
  }

  /**
   * Approve invoice item
   * POST /api/whiteboard/invoice-items/:id/approve
   */
  @Post('invoice-items/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  approveInvoiceItem(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.whiteboardService.approveInvoiceItem(id, req.user);
  }

  /**
   * Reject invoice item
   * POST /api/whiteboard/invoice-items/:id/reject
   */
  @Post('invoice-items/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  rejectInvoiceItem(
    @Param('id') id: string,
    @Body(CleanDtoPipe) rejectInvoiceItemDto: RejectInvoiceItemDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.rejectInvoiceItem(id, rejectInvoiceItemDto, req.user);
  }

  /**
   * Create handover note
   * POST /api/whiteboard/patients/:patientId/handover-notes
   */
  @Post('patients/:patientId/handover-notes')
  @HttpCode(HttpStatus.CREATED)
  createHandoverNote(
    @Param('patientId') patientId: string,
    @Body(CleanDtoPipe) createHandoverNoteDto: CreateHandoverNoteDto,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.createHandoverNote(patientId, createHandoverNoteDto, req.user);
  }

  /**
   * Get handover notes
   * GET /api/whiteboard/patients/:patientId/handover-notes
   */
  @Get('patients/:patientId/handover-notes')
  getHandoverNotes(
    @Param('patientId') patientId: string,
    @Query('shiftDate') shiftDate: string | undefined,
    @Query('shiftType') shiftType: 'AM' | 'PM' | 'Night' | undefined,
    @Request() req: { user: UserContext },
  ) {
    return this.whiteboardService.getHandoverNotes(patientId, shiftDate, shiftType, req.user);
  }
}

