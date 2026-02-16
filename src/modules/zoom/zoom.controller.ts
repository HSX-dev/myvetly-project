import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ZoomService } from './zoom.service';
import { CreateZoomMeetingDto } from './dto';
import { AuthGuard } from '../auth/auth.guard';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('zoom')
@UseGuards(AuthGuard)
export class ZoomController {
  constructor(private readonly zoomService: ZoomService) { }

  @Post('meetings')
  @HttpCode(HttpStatus.CREATED)
  async createMeeting(@Body(CleanDtoPipe) createMeetingDto: CreateZoomMeetingDto) {
    const meeting = await this.zoomService.createMeeting(createMeetingDto);

    return {
      success: true,
      meeting: {
        id: meeting.id.toString(),
        topic: meeting.topic,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
        start_time: meeting.start_time,
        duration: meeting.duration,
      },
    };
  }
}

