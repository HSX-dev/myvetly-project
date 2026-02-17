import { IsOptional, IsNumber, IsBoolean, IsEnum, IsString, IsDateString } from 'class-validator';

export class UpdateVitalsDto {
  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsEnum(['lbs', 'kg'])
  weight_unit?: 'lbs' | 'kg';

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsEnum(['rectal', 'ear', 'axilla', 'dermal', 'microchip'])
  temp_location?: 'rectal' | 'ear' | 'axilla' | 'dermal' | 'microchip';

  @IsOptional()
  @IsNumber()
  pulse?: number;

  @IsOptional()
  @IsNumber()
  respiratory_rate?: number;

  @IsOptional()
  @IsBoolean()
  pant?: boolean;

  @IsOptional()
  @IsBoolean()
  purr?: boolean;

  @IsOptional()
  @IsBoolean()
  vocalizing?: boolean;

  @IsOptional()
  @IsString()
  mucous_membrane_color?: string;

  @IsOptional()
  @IsEnum(['<= 2 s', '> 2 s', 'DNO'])
  capillary_refill_time?: '<= 2 s' | '> 2 s' | 'DNO';

  @IsOptional()
  @IsEnum(['moist', 'tacky', 'dry'])
  mucous_membrane_hydration?: 'moist' | 'tacky' | 'dry';

  @IsOptional()
  @IsString()
  attitude?: string;

  @IsOptional()
  @IsString()
  mentation?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  did_not_obtain?: boolean;

  @IsOptional()
  @IsDateString()
  taken_at?: string;
}


