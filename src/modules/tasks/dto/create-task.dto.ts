import { Expose, Transform } from 'class-transformer';
import { IsString, IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';

export class CreateTaskDto {
  @Expose()
  @IsString()
  title: string;

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
  due_date: string;

  @Expose()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  assigned_to: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  patient_id?: string;
}





