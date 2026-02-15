import { IsString, IsOptional, IsUUID, IsNotEmpty } from 'class-validator';
import { Transform, Expose, Exclude } from 'class-transformer';

export class CreateVaccinationDto {
  @Expose()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  pet_id: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  clinic_id?: string;

  // Support both vaccine_name and vaccination_name field names
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  vaccine_name?: string;

  @Expose()
  @IsString({ message: 'vaccination_name must be a string' })
  @IsNotEmpty({ message: 'vaccination_name is required' })
  @Transform(({ value, obj }) => {
    // First, try to use vaccination_name if provided
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    // Fallback to vaccine_name if vaccination_name is not present
    if (obj && obj.vaccine_name && typeof obj.vaccine_name === 'string') {
      const trimmed = obj.vaccine_name.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  vaccination_name: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  vaccination_type?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  date_given?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  due_date?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  next_due_date?: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  administered_by?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}




