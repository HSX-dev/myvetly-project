import { Expose } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @Expose()
  @IsEmail()
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  full_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  first_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  last_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  role?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  organization_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  clinic_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  status?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  role_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  role_name?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  has_set_password?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  timezone?: string;
}

