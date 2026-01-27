import { IsString, IsOptional, IsEnum } from 'class-validator';

export class AddPatientToWhiteboardDto {
  @IsString()
  appointment_id: string;

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
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  notes?: string;
}

