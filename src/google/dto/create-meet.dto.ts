import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class CreateGoogleMeetDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  appointment_id?: string;

  @Expose()
  @IsString({ message: 'summary must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  summary: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @Expose()
  @IsString({ message: 'start_time must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_time: string;

  // Support both duration (preferred) and duration_minutes (legacy)
  @Expose()
  @IsOptional()
  @IsNumber({}, { message: 'duration_minutes must be a number' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  duration_minutes?: number;

  @Expose()
  @IsNumber({}, { message: 'duration must be a number' })
  @Transform(({ value, obj }) => {
    // Prioritize duration, fallback to duration_minutes
    if (value !== undefined && value !== null) {
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? value : parsed;
      }
      return value;
    }
    if (obj && obj.duration_minutes !== undefined && obj.duration_minutes !== null) {
      if (typeof obj.duration_minutes === 'string') {
        const parsed = parseInt(obj.duration_minutes, 10);
        return isNaN(parsed) ? obj.duration_minutes : parsed;
      }
      return obj.duration_minutes;
    }
    return value;
  })
  duration: number;
}


