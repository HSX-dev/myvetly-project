import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateGoogleMeetDto {
  @IsOptional()
  @IsString()
  appointment_id?: string;

  @IsString()
  summary: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  start_time: string;

  @IsNumber()
  duration: number;
}


