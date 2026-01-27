import { Controller, Get, Param, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CloseSessionDto } from './dto/close-session.dto';

@Controller('telehealth')
@UseGuards(AuthGuard)
export class TelehealthController {
  constructor(private readonly telehealthService: TelehealthService) {}

  /**
   * Get all messages for a session
   * GET /api/telehealth/sessions/:id/messages
   * More specific route must come BEFORE less specific route
   */
  @Get('sessions/:id/messages')
  async getSessionMessages(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.telehealthService.getSessionMessages(id, req.user);
  }

  /**
   * Mark messages as read for a session
   * PATCH /api/telehealth/sessions/:id/messages/read
   * More specific route must come BEFORE less specific route
   */
  @Patch('sessions/:id/messages/read')
  async markMessagesAsRead(@Param('id') id: string, @Request() req: { user: UserContext }) {
    await this.telehealthService.markMessagesAsRead(id, req.user);
    return { success: true };
  }

  /**
   * Close a telehealth session
   * PATCH /api/telehealth/sessions/:id/close
   * More specific route must come BEFORE less specific route
   */
  @Patch('sessions/:id/close')
  async closeSession(
    @Param('id') id: string,
    @Body() closeDto: CloseSessionDto,
    @Request() req: { user: UserContext }
  ) {
    await this.telehealthService.closeSession(id, closeDto, req.user);
    return { success: true };
  }

  /**
   * Get all telehealth sessions for the current vet user
   * GET /api/telehealth/sessions
   * Must come BEFORE sessions/:id to avoid route conflicts
   */
  @Get('sessions')
  async getVetSessions(@Request() req: { user: UserContext }) {
    return this.telehealthService.getVetSessions(req.user);
  }

  /**
   * Get a single session by ID
   * GET /api/telehealth/sessions/:id
   * Less specific route - must come AFTER more specific routes
   */
  @Get('sessions/:id')
  async findOne(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.telehealthService.findOne(id, req.user);
  }

  /**
   * Find session by appointment ID
   * GET /api/telehealth/appointment/:appointmentId
   */
  @Get('appointment/:appointmentId')
  async findByAppointment(@Param('appointmentId') appointmentId: string) {
    return this.telehealthService.findByAppointment(appointmentId);
  }
}
