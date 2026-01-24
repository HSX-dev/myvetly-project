import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { AppointmentStatus, AppointmentType } from '../../utils/enums';

export class UpdateAppointmentDto {
  @Expose()
  @IsUUID()
  @IsOptional()
  veterinarian_id?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  appointment_time?: string;

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

