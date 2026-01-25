import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsDateString, IsUUID, IsNumber } from 'class-validator';

export class UpdatePetDto {
  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  species?: string;

  @Expose()
  @IsString()
  @IsOptional()
  breed?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  birth_date?: string;

  @Expose()
  @IsString()
  @IsOptional()
  gender?: string;

  @Expose()
  @IsString()
  @IsOptional()
  color?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  weight?: number;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  status?: string;
}

