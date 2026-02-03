import { Expose } from 'class-transformer';
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
  @IsEnum(['pending', 'in_progress', 'completed'])
  @IsOptional()
  status?: 'pending' | 'in_progress' | 'completed';

  @Expose()
  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority?: 'low' | 'medium' | 'high';

  @Expose()
  @IsDateString()
  due_date: string;

  @Expose()
  @IsUUID()
  assigned_to: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  patient_id?: string;
}





