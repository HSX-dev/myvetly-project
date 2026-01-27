import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

export class ScheduleProcedureDto {
  @IsString()
  treatment_name: string;

  @IsEnum(['surgery', 'imaging', 'dental', 'outpatient', 'other'])
  procedure_type: 'surgery' | 'imaging' | 'dental' | 'outpatient' | 'other';

  @IsOptional()
  @IsString()
  procedure_scheduled_time?: string;

  @IsOptional()
  @IsString()
  scheduled_time?: string;

  @IsOptional()
  @IsString()
  treatment_plan_id?: string;

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

