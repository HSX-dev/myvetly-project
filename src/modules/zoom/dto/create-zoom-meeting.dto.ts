import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class CreateZoomMeetingDto {
  @Expose()
  @IsString({ message: 'topic must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  topic: string;

  @Expose()
  @IsDateString({}, { message: 'start_time must be a valid ISO 8601 date string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_time: string;

  @Expose()
  @IsNumber({}, { message: 'duration must be a number' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  duration: number;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  agenda?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  appointment_id?: string;
}





