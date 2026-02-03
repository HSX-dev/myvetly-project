import { Expose } from 'class-transformer';
import { IsString, IsBoolean, IsArray, IsUUID, IsOptional } from 'class-validator';

export class CreateClinicUserRoleDto {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  description: string;

  @Expose()
  @IsBoolean()
  status: boolean;

  @Expose()
  @IsArray()
  @IsString({ each: true })
  admin_controls: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  view_access: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  create_access: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  edit_access: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  cancel_access: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  delete_access: string[];

  @Expose()
  @IsUUID()
  clinic_id: string;

  @Expose()
  @IsUUID()
  user_id: string; // auth user id

  @Expose()
  @IsUUID()
  created_by: string;

  @Expose()
  @IsUUID()
  assigned_by: string; // updated_by

  @Expose()
  @IsUUID()
  organization_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  admin_role_id?: string;
}

