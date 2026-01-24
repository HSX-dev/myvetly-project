import { Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { AppointmentStatus, AppointmentType } from '../../utils/enums';

export class CreateAppointmentDto {
  @Expose()
  @IsUUID()
  pet_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  clinic_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  veterinarian_id?: string;

  @Expose()
  @IsDateString()
  appointment_time: string;

  @Expose()
  @IsEnum(AppointmentType)
  @IsOptional()
  type?: AppointmentType;

  @Expose()
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @Expose()
  @IsString()
  @IsOptional()
  notes?: string;

  @Expose()
  @IsString()
  @IsOptional()
  reason?: string;
}

