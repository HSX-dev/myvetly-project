import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsUUID, IsDateString, IsArray } from 'class-validator';

export class CreatePetDto {
  @Expose()
  @IsUUID()
  client_id: string;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  @IsOptional()
  species?: string;

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  breed?: string[];

  @Expose()
  @IsDateString()
  @IsOptional()
  date_of_birth?: string;

  @Expose()
  @IsString()
  @IsOptional()
  gender?: string;

  @Expose()
  @IsString()
  @IsOptional()
  color?: string;

  @Expose()
  @IsString()
  @IsOptional()
  weight?: string;
}

