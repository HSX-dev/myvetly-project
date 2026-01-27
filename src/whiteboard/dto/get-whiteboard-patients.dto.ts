import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';

export class GetWhiteboardPatientsDto {
  @IsOptional()
  @IsString()
  assigned_vet_id?: string;

  @IsOptional()
  @IsString()
  assigned_tech_id?: string;

  @IsOptional()
  @IsEnum(['waiting', 'in_progress', 'completed', 'discharged'])
  status?: string;

  @IsOptional()
  @IsString()
  location_id?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['surgery', 'imaging', 'dental', 'outpatient', 'other'])
  procedure_type?: string;

  @IsOptional()
  @IsEnum(['ready', 'pre_medded', 'in_procedure', 'recovery', 'completed'])
  procedure_status?: string;

  @IsOptional()
  @IsBoolean()
  show_overdue_only?: boolean;

  @IsOptional()
  @IsEnum(['icu', 'ward', 'surgery', 'isolation', 'treatment'])
  location_group?: string;
}

