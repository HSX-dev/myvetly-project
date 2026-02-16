import { Expose, Transform } from 'class-transformer';
import { IsString, IsBoolean, IsArray, IsUUID, IsOptional } from 'class-validator';

export class CreateClinicUserRoleDto {
  // Support both name and role_name
  @Expose()
  @IsOptional()
  @IsString()
  role_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  @Transform(({ value, obj }) => {
    // Prioritize name, fallback to role_name
    if (value && typeof value === 'string') {
      return value.trim();
    }
    if (obj && obj.role_name && typeof obj.role_name === 'string') {
      return obj.role_name.trim();
    }
    return value;
  })
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : (typeof value === 'string' ? value.trim() : value)))
  description?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true; // Default to true
    return Boolean(value);
  })
  status?: boolean;

  // Support both permissions array and individual access arrays
  @Expose()
  @IsOptional()
  @IsArray()
  permissions?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  admin_controls?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  view_access?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  create_access?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  edit_access?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cancel_access?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  delete_access?: string[];

  @Expose()
  @IsUUID()
  clinic_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  user_id?: string; // auth user id - will be auto-populated from user context

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  created_by?: string; // will be auto-populated from user context

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  assigned_by?: string; // updated_by - will be auto-populated from user context

  @Expose()
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  organization_id?: string; // will be auto-populated from user context

  @Expose()
  @IsUUID()
  @IsOptional()
  admin_role_id?: string;
}

