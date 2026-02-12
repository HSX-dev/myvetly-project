import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateReminderDto {
  @IsString()
  pet_id: string;

  @IsString()
  @IsOptional()
  clinic_id?: string;

  @IsString()
  task_title: string;

  @IsString()
  @IsOptional()
  task_type?: 'vaccination' | 'medication' | 'checkup' | 'dental' | 'grooming' | 'other';

  @IsDateString()
  due_date: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  assigned_to?: string;
}


