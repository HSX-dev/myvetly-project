import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail, IsUUID } from 'class-validator';

export class CreateClientDto {
  @Expose()
  @IsUUID()
  user_id: string;

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

