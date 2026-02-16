import { Expose } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServicesProductsPriceSettingDto, ServicesProductsAutomaticTaskDto } from './create-clinic-service.dto';

export class UpdateClinicServiceDto {
  @Expose()
  @IsString()
  @IsOptional()
  service_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  default_medical_record_note?: string | null;

  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  duration_minutes?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  price?: number;

  @Expose()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  type?: 'Injections' | 'Medication' | 'Product' | 'Service' | 'Vaccine' | null;

  @Expose()
  @IsObject()
  @IsOptional()
  details?: any;

  @Expose()
  @IsBoolean()
  @IsOptional()
  include_in_medical_record?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  include_on_invoice_if_declined?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  invoice_line_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  inventory_id?: string | null;

  @Expose()
  @ValidateNested()
  @Type(() => ServicesProductsPriceSettingDto)
  @IsOptional()
  price_setting?: ServicesProductsPriceSettingDto;

  @Expose()
  @ValidateNested()
  @Type(() => ServicesProductsAutomaticTaskDto)
  @IsOptional()
  automatic_actions?: ServicesProductsAutomaticTaskDto | null;

  @Expose()
  @IsString()
  @IsOptional()
  discharge_instructions?: string | null;

  @Expose()
  @IsString()
  @IsOptional()
  category_id?: string | null;

  @Expose()
  @IsString()
  @IsOptional()
  dispensing_id?: string | null;
}


