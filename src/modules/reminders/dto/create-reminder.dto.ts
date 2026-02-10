import { Expose, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDateString,
  ArrayMinSize,
  ValidateIf,
  Matches,
} from 'class-validator';

export enum ReminderCategory {
  FEEDING = 'feeding',
  POTTY = 'potty',
  MEDICATION = 'medication',
  SUPPLEMENTS = 'supplements',
  PREVENTATIVE = 'preventative',
  GROOMING = 'grooming',
  EXERCISE = 'exercise',
  OTHER = 'other',
}

export enum ReminderStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
}

export class CreateReminderDto {
  @Expose()
  @IsUUID()
  pet_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string; // Can be resolved server-side from x-user-id

  @Expose()
  @IsEnum(ReminderCategory)
  category: ReminderCategory;

  @Expose()
  @IsString()
  title: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  repeat?: boolean = false;

  @Expose()
  @IsArray()
  @IsOptional()
  @ValidateIf((o) => o.repeat === true)
  @ArrayMinSize(1, { message: 'days_of_week is required when repeat is true' })
  days_of_week?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat

  @Expose()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one time is required' })
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    each: true,
    message: 'Each time must be in HH:mm format',
  })
  times_of_day: string[]; // Array of "HH:mm" strings

  @Expose()
  @IsDateString()
  start_date: string; // ISO date string

  @Expose()
  @IsDateString()
  @IsOptional()
  end_date?: string; // ISO date string

  @Expose()
  @IsString()
  @IsOptional()
  notes?: string;

  @Expose()
  @IsString()
  @IsOptional()
  photo_url?: string;

  @Expose()
  @IsEnum(ReminderStatus)
  @IsOptional()
  status?: ReminderStatus = ReminderStatus.ACTIVE;
}
