import { Expose } from 'class-transformer';
import { IsArray, IsString, IsOptional, IsObject } from 'class-validator';

export interface BreakTime {
  days: string[];
  hour_start: string;
  hour_end: string;
}

export class CreateUserScheduleDto {
  @Expose()
  @IsArray()
  @IsString({ each: true })
  availability_days: string[];

  @Expose()
  @IsString()
  availability_hours_start: string;

  @Expose()
  @IsString()
  availability_hours_end: string;

  @Expose()
  @IsArray()
  @IsObject({ each: true })
  break_times: BreakTime[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  services_offered: string[];

  @Expose()
  @IsString()
  @IsOptional()
  color?: string;

  @Expose()
  @IsObject()
  @IsOptional()
  additionals?: object;
}


