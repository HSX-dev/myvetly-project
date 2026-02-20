import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';

export class UpdateTaskDto {
  @Expose()
  @IsString()
  @IsOptional()
  title?: string;

  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @IsEnum(['open', 'in_progress', 'closed'])
  @IsOptional()
  status?: 'open' | 'in_progress' | 'closed';

  @Expose()
  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority?: 'low' | 'medium' | 'high';

  @Expose()
  @IsDateString()
  @IsOptional()
  due_date?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  assigned_to?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  patient_id?: string;
}





