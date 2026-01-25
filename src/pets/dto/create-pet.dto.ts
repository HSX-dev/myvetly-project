import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsUUID, IsDateString, IsNumber } from 'class-validator';

export class CreatePetDto {
  @Expose()
  @IsUUID()
  client_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  tenant_id?: string;

  @Expose()
  @IsString()
  name: string;

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
  @IsString()
  @IsOptional()
  status?: string;
}

