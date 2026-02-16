import { IsOptional, IsBoolean, IsString, IsEnum } from 'class-validator';
import { Expose } from 'class-transformer';

export enum DashboardTimeRange {
  TODAY = 'today',
  SEVEN_DAYS = '7days',
  THIRTY_DAYS = '30days',
}

export class DashboardFiltersDto {
  @Expose()
  @IsOptional()
  @IsBoolean()
  mine?: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  status?: string;

  @Expose()
  @IsOptional()
  @IsString()
  search?: string;

  @Expose()
  @IsOptional()
  @IsEnum(DashboardTimeRange)
  timeRange?: DashboardTimeRange;
}
