import { Expose } from 'class-transformer';
import { IsArray, IsString, IsOptional, IsObject } from 'class-validator';
import type { BreakTime } from './create-user-schedule.dto';

export class UpdateUserScheduleDto {
  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availability_days?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  availability_hours_start?: string;

  @Expose()
  @IsString()
  @IsOptional()
  availability_hours_end?: string;

  @Expose()
  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  break_times?: BreakTime[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  services_offered?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  color?: string;

  @Expose()
  @IsObject()
  @IsOptional()
  additionals?: object;
}

