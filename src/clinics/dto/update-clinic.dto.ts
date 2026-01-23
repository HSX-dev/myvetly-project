import { Expose } from 'class-transformer';
import { IsString, IsOptional } from 'class-validator';

export class UpdateClinicDto {
  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  email?: string;
}

