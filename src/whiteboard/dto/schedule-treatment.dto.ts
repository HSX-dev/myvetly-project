import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

export class ScheduleTreatmentDto {
  @IsString()
  treatment_name: string;

  @IsOptional()
  @IsString()
  treatment_plan_id?: string;

  @IsOptional()
  @IsString()
  scheduled_time?: string;

  @IsEnum(['STAT', 'PRN', 'scheduled'])
  status: 'STAT' | 'PRN' | 'scheduled';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsNumber()
  duration_minutes?: number;

  @IsOptional()
  @IsString()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

