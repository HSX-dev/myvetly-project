import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateProcedureStatusDto {
  @IsEnum(['ready', 'pre_medded', 'in_procedure', 'recovery', 'completed'])
  procedure_status: 'ready' | 'pre_medded' | 'in_procedure' | 'recovery' | 'completed';

  @IsOptional()
  @IsString()
  notes?: string;
}

