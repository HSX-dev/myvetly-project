import { Expose } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';

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
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  role?: string;
}

