import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GoogleService } from './google.service';
import { ExchangeOAuthDto, CreateGoogleMeetDto } from './dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('google')
@UseGuards(AuthGuard)
export class GoogleController {
  constructor(private readonly googleService: GoogleService) { }

  /**
   * Exchange OAuth authorization code for tokens
   * POST /api/google/oauth/exchange
   */
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  exchangeOAuthCode(
    @Body(CleanDtoPipe) exchangeOAuthDto: ExchangeOAuthDto,
    @Request() req: { user: UserContext },
  ) {
    return this.googleService.exchangeOAuthCode(exchangeOAuthDto, req.user);
  }

  /**
   * Get user's Google Calendar connection status
   * GET /api/google/connection-status/:vetId
   */
  @Get('connection-status/:vetId')
  getConnectionStatus(
    @Param('vetId') vetId: string,
    @Request() req: { user: UserContext },
  ) {
    return this.googleService.getConnectionStatus(vetId, req.user);
  }

  /**
   * Disconnect Google Calendar
   * POST /api/google/disconnect/:vetId
   */
  @Post('disconnect/:vetId')
  @HttpCode(HttpStatus.OK)
  disconnect(
    @Param('vetId') vetId: string,
    @Request() req: { user: UserContext },
  ) {
    return this.googleService.disconnect(vetId, req.user);
  }

  /**
   * Create Google Meet link
   * POST /api/google/meet
   */
  @Post('meet')
  @HttpCode(HttpStatus.OK)
  createGoogleMeet(
    @Body(CleanDtoPipe) createGoogleMeetDto: CreateGoogleMeetDto,
    @Request() req: { user: UserContext },
  ) {
    return this.googleService.createGoogleMeet(createGoogleMeetDto, req.user);
  }
}


