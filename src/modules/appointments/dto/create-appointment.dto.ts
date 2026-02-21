import { Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsNumber,
  IsBoolean,
  ValidateIf,
  IsIn,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { AppointmentStatus } from '../../../utils/enums';

@ValidatorConstraint({ name: 'isFutureDate', async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(dateString: string, args: ValidationArguments) {
    if (!dateString) return false;
    const appointmentDate = new Date(dateString);
    const now = new Date();
    // Allow appointments at least 1 minute in the future (buffer for clock differences)
    const minFutureTime = new Date(now.getTime() + 60000); // 1 minute buffer
    return appointmentDate >= minFutureTime;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Appointment time must be in the future. Cannot create appointments in the past.';
  }
}

export class CreateAppointmentDto {
  // Optional for Block appointments
  // Validate UUID only if value is provided and not empty string
  @Expose()
  @ValidateIf((o) => o.pet_id !== '' && o.pet_id != null)
  @IsUUID()
  @IsOptional()
  pet_id?: string;

  @Expose()
  @ValidateIf((o) => o.client_id !== '' && o.client_id != null)
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @ValidateIf((o) => o.vet_id !== '' && o.vet_id != null)
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
  @Validate(IsFutureDateConstraint)
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
  @IsIn(['low', 'medium', 'high', 'critical'])
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
