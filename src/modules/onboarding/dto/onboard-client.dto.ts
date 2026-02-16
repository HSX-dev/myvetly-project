import { Expose, Type } from 'class-transformer';
import {
  IsString,
  IsEmail,
  IsEnum,
  IsDefined,
  IsNotEmpty,
  IsNotEmptyObject,
  IsUUID,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class OrganizationDataDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  organization_name: string;

  // plan_id is not stored in organizations table, so it's optional
  // It can be used for other purposes (e.g., subscription management) but not stored in the organization record
  @Expose()
  @IsUUID()
  @IsOptional()
  plan_id?: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  contact_name: string;

  @Expose()
  @IsEmail()
  @IsNotEmpty()
  contact_email: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class ClinicAdminDataDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  clinic_name: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  address: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  admin_full_name: string;

  @Expose()
  @IsEmail()
  @IsNotEmpty()
  admin_email: string;

  @Expose()
  @IsEnum(['org_admin', 'clinic_admin'])
  @IsNotEmpty()
  admin_role: 'org_admin' | 'clinic_admin';
}

export class OnboardClientDto {
  @Expose()
  @Type(() => OrganizationDataDto)
  @IsDefined()
  @IsNotEmptyObject()
  @ValidateNested()
  organizationData: OrganizationDataDto;

  @Expose()
  @Type(() => ClinicAdminDataDto)
  @IsDefined()
  @IsNotEmptyObject()
  @ValidateNested()
  clinicAdminData: ClinicAdminDataDto;
}

