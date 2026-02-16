import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber } from 'class-validator';
import { Transform, Expose } from 'class-transformer';

export class CreateFileDto {
  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  pet_id?: string;

  @Expose()
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @Expose()
  @IsNumber({}, { message: 'file_size must be a number' })
  @IsNotEmpty({ message: 'file_size is required' })
  file_size: number;

  @Expose()
  @IsString({ message: 'storage_path must be a string' })
  @IsNotEmpty({ message: 'storage_path is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  storage_path: string;

  @Expose()
  @IsString({ message: 'kind must be a string' })
  @IsOptional()
  kind?: string;
}


