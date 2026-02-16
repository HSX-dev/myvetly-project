import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsDateString, IsArray } from 'class-validator';

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

