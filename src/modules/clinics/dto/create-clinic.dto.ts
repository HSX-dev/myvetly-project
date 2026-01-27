import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateClinicDto {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsUUID()
  organization_id: string;

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

