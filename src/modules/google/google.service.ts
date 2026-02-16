import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UsersService } from '../users/users.service';
import { UserContext } from '../auth/auth.guard';
import { ExchangeOAuthDto, CreateGoogleMeetDto } from './dto';

@Injectable()
export class GoogleService {
  private googleClientId: string | null = null;
  private googleClientSecret: string | null = null;
  private googleRedirectUri: string | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    this.googleClientId = this.configService.get<string>('google.clientId') || null;
    this.googleClientSecret = this.configService.get<string>('google.clientSecret') || null;
    this.googleRedirectUri = this.configService.get<string>('google.redirectUri') || null;
  }

  /**
   * Exchange OAuth authorization code for access and refresh tokens
   * Matches original frontend Edge Function logic exactly
   */
  async exchangeOAuthCode(
    exchangeOAuthDto: ExchangeOAuthDto,
    user: UserContext,
  ): Promise<{
    success: boolean;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    if (!this.googleClientId || !this.googleClientSecret) {
      throw new BadRequestException(
        'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.',
      );
    }

    try {
      // Use redirect_uri from DTO or fallback to config
      const redirectUri = exchangeOAuthDto.redirect_uri || this.googleRedirectUri;
      
      if (!redirectUri) {
        throw new BadRequestException(
          'redirect_uri is required. Please provide it in the request body or set GOOGLE_REDIRECT_URI in environment variables.',
        );
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.googleClientId,
          client_secret: this.googleClientSecret,
          code: exchangeOAuthDto.code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new BadRequestException(
          errorData.error_description || errorData.error || 'Failed to exchange OAuth code. The authorization code may be invalid or expired.',
        );
      }

      const tokenData = await tokenResponse.json();

      if (!tokenData.refresh_token) {
        throw new BadRequestException(
          'No refresh token received. Please ensure you granted offline access during OAuth authorization.',
        );
      }

      // Get Google account email
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new BadRequestException('Failed to get Google account information');
      }

      const userInfo = await userInfoResponse.json();
      const googleAccountEmail = userInfo.email;

      if (!googleAccountEmail) {
        throw new BadRequestException('Google account email not found');
      }

      // Store refresh token in user's profile
      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('users')
        .update({
          google_refresh_token: tokenData.refresh_token,
          google_account_email: googleAccountEmail,
          google_calendar_id: 'primary',
        })
        .eq('id', user.user_id);

      if (updateError) {
        throw new BadRequestException(`Failed to save Google OAuth tokens: ${updateError.message || 'Database error'}`);
      }

      return {
        success: true,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      };
    } catch (error) {
      console.error('Error exchanging OAuth code:', error);
      
      // If it's already a NestJS exception, re-throw it
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }

      // For other errors, throw BadRequestException with error message
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to exchange OAuth code',
      );
    }
  }

  /**
   * Get user's Google Calendar connection status
   */
  async getConnectionStatus(
    vetId: string,
    user: UserContext,
  ): Promise<{
    is_connected: boolean;
    google_account_email: string | null;
    google_calendar_id: string;
  }> {
    // Validate access - allow super_admin or if vetId matches user's id or user_id
    if (user.role !== 'super_admin' && user.id !== vetId && user.user_id !== vetId) {
      throw new ForbiddenException('Access denied: Cannot access other user\'s connection status');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('google_account_email, google_refresh_token, google_calendar_id')
      .eq('id', vetId)
      .single();

    if (error) {
      throw new NotFoundException(`User with id ${vetId} not found`);
    }

    return {
      is_connected: !!data?.google_refresh_token,
      google_account_email: data?.google_account_email || null,
      google_calendar_id: data?.google_calendar_id || 'primary',
    };
  }

  /**
   * Disconnect Google Calendar (remove tokens)
   */
  async disconnect(vetId: string, user: UserContext): Promise<void> {
    // Validate access - allow super_admin or if vetId matches user's id or user_id
    if (user.role !== 'super_admin' && user.id !== vetId && user.user_id !== vetId) {
      throw new ForbiddenException('Access denied: Cannot disconnect other user\'s Google account');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('users')
      .update({
        google_refresh_token: null,
        google_account_email: null,
        google_calendar_id: 'primary',
      })
      .eq('id', vetId);

    if (error) {
      throw new BadRequestException(`Failed to disconnect Google Calendar: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get Google access token from refresh token
   */
  private async getAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
    if (!this.googleClientId || !this.googleClientSecret) {
      throw new InternalServerErrorException('Google OAuth is not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      throw new BadRequestException(
        errorData.error_description || errorData.error || 'Failed to refresh access token',
      );
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }

  /**
   * Create Google Meet link via Calendar API
   * Matches original frontend Edge Function logic exactly
   */
  async createGoogleMeet(
    createGoogleMeetDto: CreateGoogleMeetDto,
    user: UserContext,
  ): Promise<{
    success: boolean;
    meeting: {
      google_calendar_event_id: string;
      google_calendar_id: string;
      google_meet_url: string;
      google_meet_conference_id: string;
      summary: string;
      start_time: string;
      end_time: string;
    };
  }> {
    // Get user's Google refresh token
    const { data: userData, error: userError } = await this.supabaseService
      .getClient()
      .from('users')
      .select('google_refresh_token, google_calendar_id')
      .eq('id', user.user_id)
      .single();

    if (userError || !userData?.google_refresh_token) {
      throw new BadRequestException('Google Calendar not connected. Please connect your Google account first.');
    }

    try {
      // Get access token from refresh token
      const accessToken = await this.getAccessTokenFromRefreshToken(userData.google_refresh_token);

      // Calculate end time
      const startTime = new Date(createGoogleMeetDto.start_time);
      const endTime = new Date(startTime.getTime() + createGoogleMeetDto.duration * 60000);

      // Validate start time is in the future
      if (startTime < new Date()) {
        throw new BadRequestException('Meeting start time must be in the future');
      }

      // Create calendar event with Google Meet
      const eventResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: createGoogleMeetDto.summary,
          description: createGoogleMeetDto.description || '',
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC',
          },
          conferenceData: {
            createRequest: {
              requestId: `meet-${Date.now()}`,
              conferenceSolutionKey: {
                type: 'hangoutsMeet',
              },
            },
          },
        }),
      });

      if (!eventResponse.ok) {
        const errorData = await eventResponse.json().catch(() => ({}));
        throw new BadRequestException(
          errorData.error?.message || 'Failed to create Google Calendar event. Please check your Google Calendar permissions.',
        );
      }

      const eventData = await eventResponse.json();

      if (!eventData.hangoutLink) {
        throw new BadRequestException('Google Meet link was not generated. Please try again.');
      }

      // Update appointment with Google Meet info if appointment_id provided
      if (createGoogleMeetDto.appointment_id) {
        const { error: updateError } = await this.supabaseService
          .getClient()
          .from('appointments')
          .update({
            google_calendar_event_id: eventData.id,
            google_calendar_id: userData.google_calendar_id || 'primary',
            google_meet_url: eventData.hangoutLink,
            google_meet_conference_id: eventData.conferenceData?.entryPoints?.[0]?.entryPointType === 'video'
              ? eventData.conferenceData.entryPoints[0].uri
              : null,
          })
          .eq('id', createGoogleMeetDto.appointment_id);

        if (updateError) {
          console.warn('Failed to update appointment with Google Meet info:', updateError);
          // Don't throw - the meeting was created successfully, just the appointment update failed
        }
      }

      return {
        success: true,
        meeting: {
          google_calendar_event_id: eventData.id,
          google_calendar_id: userData.google_calendar_id || 'primary',
          google_meet_url: eventData.hangoutLink,
          google_meet_conference_id: eventData.conferenceData?.entryPoints?.[0]?.uri || '',
          summary: eventData.summary,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error creating Google Meet:', error);
      
      // If it's already a NestJS exception, re-throw it
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }

      // For other errors, throw BadRequestException with error message
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to create Google Meet',
      );
    }
  }
}

