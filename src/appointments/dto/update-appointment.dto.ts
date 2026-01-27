import { Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
  IsNumber,
} from 'class-validator';
import { AppointmentStatus } from '../../utils/enums';

export class UpdateAppointmentDto {
  @Expose()
  @IsUUID()
  @IsOptional()
  pet_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  vet_id?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  appointment_time?: string;

  @Expose()
  @IsString()
  @IsOptional()
  service_type?: string;

  @Expose()
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @Expose()
  @IsString()
  @IsOptional()
  symptoms?: string;

  @Expose()
  @IsString()
  @IsOptional()
  notes?: string;

  @Expose()
  @IsString()
  @IsOptional()
  client_notes?: string;

  @Expose()
  @IsString()
  @IsOptional()
  reason_for_consultation?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  estimated_duration?: number;

  @Expose()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  @IsOptional()
  emergency_level?: 'low' | 'medium' | 'high' | 'critical';

  @Expose()
  @IsString()
  @IsOptional()
  booking_reference?: string;

  @Expose()
  @IsString()
  @IsOptional()
  payment_status?: string;

  @Expose()
  @IsString()
  @IsOptional()
  payment_reference?: string;

  // Timestamp fields for status tracking
  @Expose()
  @IsDateString()
  @IsOptional()
  checked_in_at?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  started_at?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  completed_at?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  paid_at?: string;
}
