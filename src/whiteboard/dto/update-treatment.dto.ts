import { IsOptional, IsString, IsEnum, IsNumber } from 'class-validator';

export class UpdateTreatmentDto {
  @IsOptional()
  @IsString()
  treatment_name?: string;

  @IsOptional()
  @IsString()
  scheduled_time?: string;

  @IsOptional()
  @IsEnum(['STAT', 'PRN', 'scheduled', 'completed', 'cancelled'])
  status?: 'STAT' | 'PRN' | 'scheduled' | 'completed' | 'cancelled';

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



