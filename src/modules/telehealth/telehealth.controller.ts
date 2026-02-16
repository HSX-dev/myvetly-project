import { Controller, Get, Param, Patch, Post, Body, UseGuards, Request, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
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
    // DEBUG: Log what we receive
    console.log('=== DEBUG: Send Message Endpoint ===');
    console.log('URL parameter id:', id);
    console.log('Request body received:', JSON.stringify(sendMessageDto, null, 2));
    console.log('sendMessageDto.session_id before setting:', sendMessageDto.session_id);
    
    // Set session_id from URL parameter (validation allows it to be optional)
    // This ensures session_id is always set before calling the service
    sendMessageDto.session_id = id;
    console.log('sendMessageDto.session_id after setting:', sendMessageDto.session_id);
    console.log('=== End DEBUG ===');
    
    // TypeScript assertion: session_id is now guaranteed to be set from URL parameter
    return this.telehealthService.sendMessage(sendMessageDto as SendMessageDto & { session_id: string }, req.user);
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
    // Validate required fields (frontend should always provide these from appointment state)
    if (!sessionData.client_id || sessionData.client_id.trim() === '') {
      throw new BadRequestException('client_id is required');
    }
    if (!sessionData.vet_id || sessionData.vet_id.trim() === '') {
      throw new BadRequestException('vet_id is required');
    }
    if (!sessionData.pet_id || sessionData.pet_id.trim() === '') {
      throw new BadRequestException('pet_id is required');
    }
    
    // Clean the data - ensure no empty strings
    const cleanedData = {
      client_id: sessionData.client_id.trim(),
      vet_id: sessionData.vet_id.trim(),
      pet_id: sessionData.pet_id.trim(),
      scheduled_time: sessionData.scheduled_time,
      consultation_type: sessionData.consultation_type,
      status: sessionData.status,
    };
    
    return this.telehealthService.createOrUpdateSessionForAppointment(appointmentId, cleanedData);
  }

  /**
   * Update host active status for a telehealth session
   * PATCH /api/telehealth/sessions/appointment/:appointmentId/host-active
   */
  @Patch('sessions/appointment/:appointmentId/host-active')
  async updateHostActive(
    @Param('appointmentId') appointmentId: string,
    @Request() req: { user: UserContext }
  ) {
    return this.telehealthService.updateHostActive(appointmentId, req.user);
  }

  /**
   * Create or get an existing telehealth session for a client/pet (without appointment)
   * POST /api/telehealth/sessions/client/:clientId/pet/:petId
   */
  @Post('sessions/client/:clientId/pet/:petId')
  @HttpCode(HttpStatus.CREATED)
  async createOrGetSessionForClient(
    @Param('clientId') clientId: string,
    @Param('petId') petId: string,
    @Request() req: { user: UserContext }
  ) {
    return this.telehealthService.createOrGetSessionForClient(clientId, petId, req.user);
  }
}
