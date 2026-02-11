import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateVaccinationDto {
  @IsUUID()
  pet_id: string;

  @IsOptional()
  @IsUUID()
  clinic_id?: string;

  @IsString()
  vaccination_name: string;

  @IsOptional()
  @IsString()
  vaccination_type?: string;

  @IsOptional()
  @IsString()
  date_given?: string;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsString()
  next_due_date?: string;

  @IsOptional()
  @IsUUID()
  administered_by?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

