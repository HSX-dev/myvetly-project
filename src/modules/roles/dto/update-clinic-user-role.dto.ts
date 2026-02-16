import { Expose } from 'class-transformer';
import { IsString, IsBoolean, IsArray, IsUUID, IsOptional } from 'class-validator';

export class UpdateClinicUserRoleDto {
  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  status?: boolean;

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
  @IsOptional()
  assigned_by?: string; // updated_by

  @Expose()
  @IsUUID()
  @IsOptional()
  admin_role_id?: string;
}

