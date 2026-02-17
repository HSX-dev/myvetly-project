import { IsString, IsOptional, IsDateString, IsUUID, IsNotEmpty } from 'class-validator';
import { Transform, Expose } from 'class-transformer';

export class CreateReminderDto {
  @Expose()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  pet_id: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  clinic_id?: string;

  // Support both message and task_title field names
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message?: string;

  @Expose()
  @IsString({ message: 'task_title must be a string' })
  @IsNotEmpty({ message: 'task_title is required' })
  @Transform(({ value, obj }) => {
    // First, try to use task_title if provided
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    // Fallback to message if task_title is not present
    if (obj && obj.message && typeof obj.message === 'string') {
      const trimmed = obj.message.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  task_title: string;

  // Support both reminder_type and task_type field names
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reminder_type?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => {
    // First, try to use task_type if provided
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    // Fallback to reminder_type if task_type is not present
    if (obj && obj.reminder_type && typeof obj.reminder_type === 'string') {
      const trimmed = obj.reminder_type.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  task_type?: 'vaccination' | 'medication' | 'checkup' | 'dental' | 'grooming' | 'other';

  // Support both reminder_date and due_date field names
  @Expose()
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reminder_date?: string;

  @Expose()
  @IsDateString({}, { message: 'due_date must be a valid ISO 8601 date string' })
  @Transform(({ value, obj }) => {
    // First, try to use due_date if provided
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    // Fallback to reminder_date if due_date is not present
    if (obj && obj.reminder_date && typeof obj.reminder_date === 'string') {
      const trimmed = obj.reminder_date.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  due_date: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  assigned_to?: string;
}

// Enums and constants for reminders
export enum ReminderCategory {
  VACCINATION = 'vaccination',
  MEDICATION = 'medication',
  CHECKUP = 'checkup',
  DENTAL = 'dental',
  GROOMING = 'grooming',
  OTHER = 'other',
}

export enum ReminderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export const REPEAT_INTERVALS = ['daily', 'weekly', 'monthly', 'annually'] as const;




