import { Expose } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

export class MarkCompleteDto {
  @Expose()
  @IsDateString()
  occurrence_date: string; // ISO date string (YYYY-MM-DD)

  @Expose()
  @IsDateString()
  @IsOptional()
  snoozed_until?: string; // ISO datetime string (if snoozing instead of completing)
}
