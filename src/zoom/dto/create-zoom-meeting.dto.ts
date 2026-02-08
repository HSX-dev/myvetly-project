import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateZoomMeetingDto {
  @IsString()
  topic: string;

  @IsDateString()
  start_time: string;

  @IsNumber()
  duration: number;

  @IsString()
  @IsOptional()
  agenda?: string;

  @IsString()
  @IsOptional()
  appointment_id?: string;
}

