import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateOrganizationDto {
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
  @IsEmail()
  @IsOptional()
  email?: string;
}

