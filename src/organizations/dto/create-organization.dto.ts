import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateOrganizationDto {
  @Expose()
  @IsString()
  name: string;

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

