import { Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { AppointmentStatus } from '../../utils/enums';

export class CreateAppointmentDto {
  // Optional for Block appointments
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
  @IsUUID()
  clinic_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  organization_id?: string;

  @Expose()
  @IsDateString()
  appointment_time: string;

  @Expose()
  @IsString()
  service_type: string;

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
  @IsBoolean()
  @IsOptional()
  is_telehealth?: boolean;

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
}
