import { IsString, IsOptional, IsDateString, IsUUID, IsNotEmpty, IsArray } from 'class-validator';
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
    // Fallback to title (PawMD app)
    if (obj && obj.title && typeof obj.title === 'string') {
      const trimmed = obj.title.trim();
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
      const t = value.trim();
      return t === '' ? undefined : t;
    }
    // Fallback to category (PawMD app)
    if (obj?.category && typeof obj.category === 'string') {
      const t = obj.category.trim();
      return t === '' ? undefined : t;
    }
    // Fallback to reminder_type if task_type is not present
    if (obj?.reminder_type && typeof obj.reminder_type === 'string') {
      const t = obj.reminder_type.trim();
      return t === '' ? undefined : t;
    }
    return value;
  })
  task_type?: string;

  // Support both reminder_date and due_date field names
  @Expose()
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reminder_date?: string;

  @Expose()
  @IsDateString({}, { message: 'due_date must be a valid ISO 8601 date string' })
  @Transform(({ value, obj }) => {
    let dateStr: string | undefined;
    // First, try to use due_date if provided
    if (value && typeof value === 'string') {
      dateStr = value.trim() || undefined;
    }
    // Fallback to start_date (PawMD app)
    else if (obj?.start_date && typeof obj.start_date === 'string') {
      dateStr = obj.start_date.trim() || undefined;
    }
    // Fallback to reminder_date if due_date is not present
    else if (obj?.reminder_date && typeof obj.reminder_date === 'string') {
      dateStr = obj.reminder_date.trim() || undefined;
    }

    // Combine with times_of_day[0] if date-only (no T) and times_of_day is provided
    if (dateStr && !dateStr.includes('T') && Array.isArray(obj?.times_of_day) && obj.times_of_day[0]) {
      const t = obj.times_of_day[0];
      const timePart = t.length <= 5 ? `${t}:00` : t;
      dateStr = `${dateStr}T${timePart}`;
    }
    return dateStr || value;
  })
  due_date: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => {
    if (typeof value === 'string') return value.trim() || undefined;
    // Fallback to notes (PawMD app)
    if (obj?.notes && typeof obj.notes === 'string') return obj.notes.trim() || undefined;
    return value;
  })
  description?: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  assigned_to?: string;

  // PawMD sends times_of_day - we need to expose it so it's available in @Transform for due_date
  @Expose()
  @IsOptional()
  @IsArray()
  times_of_day?: string[];

  // PawMD sends start_date - expose so it's available in @Transform for due_date
  @Expose()
  @IsOptional()
  @IsDateString()
  start_date?: string;

  // PawMD sends category - expose so it's available in @Transform for task_type
  @Expose()
  @IsOptional()
  @IsString()
  category?: string;

  // PawMD sends title - expose so it's available in @Transform for task_title
  @Expose()
  @IsOptional()
  @IsString()
  title?: string;

  // PawMD sends notes - expose so it's available in @Transform for description
  @Expose()
  @IsOptional()
  @IsString()
  notes?: string;
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




