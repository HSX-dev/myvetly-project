import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { Expose, Type, Transform } from 'class-transformer';

export class ReportFiltersDto {
  @Expose()
  @IsOptional()
  @IsString()
  startDate?: string;

  @Expose()
  @IsOptional()
  @IsString()
  endDate?: string;

  @Expose()
  @IsOptional()
  @IsString()
  clinicId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;

  // Clients Report specific filters
  @Expose()
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @Expose()
  @IsOptional()
  @IsEnum(['yes', 'no'])
  hasAppointments?: 'yes' | 'no';

  @Expose()
  @IsOptional()
  @IsEnum(['yes', 'no'])
  hasTelehealth?: 'yes' | 'no';

  @Expose()
  @IsOptional()
  @IsString()
  lastActivityStart?: string;

  @Expose()
  @IsOptional()
  @IsString()
  lastActivityEnd?: string;

  // Patients Report specific filters
  @Expose()
  @IsOptional()
  @IsString()
  species?: string;

  @Expose()
  @IsOptional()
  @IsString()
  breed?: string;

  @Expose()
  @IsOptional()
  @IsString()
  clientId?: string;

  // Appointments Report specific filters
  @Expose()
  @IsOptional()
  @IsString()
  serviceType?: string;

  @Expose()
  @IsOptional()
  @IsEnum(['requested', 'scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'])
  appointmentStatus?: string;

  @Expose()
  @IsOptional()
  @IsString()
  vetId?: string;

  // Financial Report specific filters
  @Expose()
  @IsOptional()
  @IsEnum(['Active', 'Charges Complete', 'Checked Out'])
  invoiceStatus?: string;

  @Expose()
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  // Allow additional dynamic filters
  [key: string]: unknown;
}

