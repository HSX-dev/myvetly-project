import { Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDateString,
  IsIn,
  ArrayMinSize,
  ValidateIf,
  Matches,
} from 'class-validator';
import {
  ReminderCategory,
  ReminderStatus,
  REPEAT_INTERVALS,
} from './create-reminder.dto';

export class UpdateReminderDto {
  @Expose()
  @IsUUID()
  @IsOptional()
  pet_id?: string;

  @Expose()
  @IsEnum(ReminderCategory)
  @IsOptional()
  category?: ReminderCategory;

  @Expose()
  @IsString()
  @IsOptional()
  title?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  repeat?: boolean;

  @Expose()
  @IsOptional()
  @IsIn(REPEAT_INTERVALS, {
    message: 'repeat_interval must be one of: daily, weekly, monthly, annually',
  })
  repeat_interval?: 'daily' | 'weekly' | 'monthly' | 'annually';

  @Expose()
  @IsArray()
  @IsOptional()
  @ValidateIf(
    (o) =>
      o.repeat === true &&
      (!o.repeat_interval || o.repeat_interval === 'weekly'),
  )
  @ArrayMinSize(1, {
    message: 'days_of_week is required when repeat is true and interval is weekly',
  })
  days_of_week?: number[];

  @Expose()
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { each: true })
  times_of_day?: string[];

  @Expose()
  @IsDateString()
  @IsOptional()
  start_date?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  end_date?: string;

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
  status?: ReminderStatus;
}
