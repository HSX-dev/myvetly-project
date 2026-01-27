import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';

export class UpdateWhiteboardPatientDto {
  @IsOptional()
  @IsString()
  location_id?: string;

  @IsOptional()
  @IsString()
  assigned_vet_id?: string;

  @IsOptional()
  @IsString()
  assigned_tech_id?: string;

  @IsOptional()
  @IsEnum(['waiting', 'in_progress', 'completed', 'discharged'])
  status?: 'waiting' | 'in_progress' | 'completed' | 'discharged';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  estimated_discharge_time?: string;

  @IsOptional()
  @IsBoolean()
  is_isolation?: boolean;

  @IsOptional()
  @IsBoolean()
  is_aggressive?: boolean;

  @IsOptional()
  @IsBoolean()
  has_special_needs?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

