import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateClientDto {
  @Expose()
  @IsString()
  @IsOptional()
  first_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  last_name?: string;

  @Expose()
  @IsEmail()
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address?: string;
}

