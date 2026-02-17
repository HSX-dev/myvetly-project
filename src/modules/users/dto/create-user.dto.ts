import { Expose } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateUserDto {
  @Expose()
  @IsEmail()
  email: string;

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
  @IsString()
  @IsOptional()
  timezone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  password?: string;

  @Expose()
  @IsOptional()
  inviteOnly?: boolean;
}

