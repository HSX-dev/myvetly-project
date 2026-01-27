import { IsOptional, IsString } from 'class-validator';

export class CompleteTreatmentDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

