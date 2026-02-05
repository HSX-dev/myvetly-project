import { Controller, Get, Param, Patch, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CloseSessionDto } from './dto/close-session.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('telehealth')
@UseGuards(AuthGuard)
export class TelehealthController {
  constructor(private readonly telehealthService: TelehealthService) {}

  /**
   * Send a message in a telehealth session
   * POST /api/telehealth/sessions/:id/messages
   * More specific route must come BEFORE less specific route
   */
  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('id') id: string,
    @Body() sendMessageDto: SendMessageDto,
    @Request() req: { user: UserContext }
  ) {
    // Set session_id from URL parameter
    sendMessageDto.session_id = id;
    return this.telehealthService.sendMessage(sendMessageDto, req.user);
  }

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

  /**
   * Create or update telehealth session for an appointment
   * POST /api/telehealth/appointment/:appointmentId/session
   */
  @Post('appointment/:appointmentId/session')
  @HttpCode(HttpStatus.CREATED)
  async createOrUpdateSessionForAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() sessionData: {
      client_id: string;
      vet_id: string;
      pet_id: string;
      scheduled_time: string;
      consultation_type?: 'chat' | 'call' | 'video';
      status?: 'scheduled' | 'waiting';
    },
    @Request() req: { user: UserContext }
  ) {
    return this.telehealthService.createOrUpdateSessionForAppointment(appointmentId, sessionData);
  }
}
