import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail, IsUUID } from 'class-validator';

export class CreateOrganizationDto {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  plan_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  contact_name?: string;

  @Expose()
  @IsEmail()
  @IsOptional()
  contact_email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsEmail()
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  status?: string;
}

