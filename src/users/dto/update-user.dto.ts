import { Expose } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';

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
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  role?: string;
}

