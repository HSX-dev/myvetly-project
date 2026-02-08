import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateZoomMeetingDto } from './dto';

interface ZoomMeetingResponse {
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  join_url: string;
  start_url: string;
  password?: string;
}

@Injectable()
export class ZoomService {
  private readonly zoomAccountId: string;
  private readonly zoomClientId: string;
  private readonly zoomClientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private configService: ConfigService) {
    this.zoomAccountId = this.configService.get<string>('ZOOM_ACCOUNT_ID') || '';
    this.zoomClientId = this.configService.get<string>('ZOOM_CLIENT_ID') || '';
    this.zoomClientSecret = this.configService.get<string>('ZOOM_CLIENT_SECRET') || '';

    if (!this.zoomAccountId || !this.zoomClientId || !this.zoomClientSecret) {
      console.warn('Zoom credentials not configured. Zoom meeting creation will fail.');
    }
  }

  /**
   * Get OAuth access token from Zoom
   * Uses Server-to-Server OAuth flow
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${this.zoomClientId}:${this.zoomClientSecret}`).toString('base64');
      
      const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${this.zoomAccountId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get Zoom access token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      // Set expiry to 50 minutes (tokens last 1 hour, refresh early)
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      if (!this.accessToken) {
        throw new InternalServerErrorException('Failed to get access token from Zoom API');
      }
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting Zoom access token:', error);
      throw new InternalServerErrorException('Failed to authenticate with Zoom API');
    }
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(createMeetingDto: CreateZoomMeetingDto): Promise<ZoomMeetingResponse> {
    if (!this.zoomAccountId || !this.zoomClientId || !this.zoomClientSecret) {
      throw new BadRequestException('Zoom credentials are not configured');
    }

    try {
      const accessToken = await this.getAccessToken();

      const meetingData: any = {
        topic: createMeetingDto.topic,
        type: 2, // Scheduled meeting
        start_time: createMeetingDto.start_time,
        duration: createMeetingDto.duration,
        timezone: 'UTC',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: false,
          waiting_room: false,
          audio: 'both',
          auto_recording: 'none',
        },
      };

      if (createMeetingDto.agenda) {
        meetingData.agenda = createMeetingDto.agenda;
      }

      const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meetingData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Zoom API error:', errorData);
        throw new InternalServerErrorException(
          `Failed to create Zoom meeting: ${errorData.message || response.statusText}`
        );
      }

      const meeting: ZoomMeetingResponse = await response.json();

      return {
        id: meeting.id,
        topic: meeting.topic,
        start_time: meeting.start_time,
        duration: meeting.duration,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
      };
    } catch (error) {
      console.error('Error creating Zoom meeting:', error);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create Zoom meeting');
    }
  }
}

