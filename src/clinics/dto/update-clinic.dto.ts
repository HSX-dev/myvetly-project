import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';

export class UpdateClinicDto {
  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  subdomain?: string;

  @Expose()
  @IsString()
  @IsOptional()
  timezone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @IsString()
  @IsOptional()
  contact_email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  website?: string;

  @Expose()
  @IsString()
  @IsOptional()
  license_number?: string;

  @Expose()
  @IsString()
  @IsOptional()
  logo_url?: string;

  @Expose()
  @IsString()
  @IsOptional()
  color_theme?: string;

  @Expose()
  @IsEnum(['solid', 'gradient'])
  @IsOptional()
  color_style?: 'solid' | 'gradient';

  @Expose()
  @IsString()
  @IsOptional()
  currency?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  tax_rate?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  appointment_duration?: number;

  @Expose()
  @IsBoolean()
  @IsOptional()
  email_reminders_enabled?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  sms_reminders_enabled?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  followup_emails_enabled?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  marketing_communications_enabled?: boolean;

  @Expose()
  @IsNumber()
  @IsOptional()
  first_reminder_hours?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  second_reminder_hours?: number;

  @Expose()
  @IsString()
  @IsOptional()
  calendar_start_time?: string;

  @Expose()
  @IsString()
  @IsOptional()
  calendar_end_time?: string;
}

