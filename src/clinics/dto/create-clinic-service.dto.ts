import { Expose } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsObject, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ServicesProductsPriceSettingDto {
  @Expose()
  @IsNumber()
  selling_price: number;

  @Expose()
  @IsNumber()
  min_price: number;

  @Expose()
  @IsString()
  @IsOptional()
  dispensing_fee_id?: string | null;

  @Expose()
  @IsNumber()
  dispensing_fee_amt: number;

  @Expose()
  @IsBoolean()
  include_on_estimate_and_invoice_print: boolean;

  @Expose()
  @IsBoolean()
  client_discount_eligible: boolean;

  @Expose()
  @IsBoolean()
  hide_from_treatment_search: boolean;

  @Expose()
  @IsBoolean()
  default_product_discount: boolean;

  @Expose()
  @IsBoolean()
  taxable: boolean;

  @Expose()
  @IsObject()
  @IsOptional()
  discount?: {
    type: '%' | '$';
    discount: number;
    note: string;
  } | null;
}

export class ServicesProductsAutomaticTaskDto {
  @Expose()
  @IsString()
  title: string;

  @Expose()
  @IsNumber()
  due_in: number;

  @Expose()
  @IsString()
  time_unit: 'Day(s)' | 'Week(s)' | 'Months(s)' | 'Year(s)';

  @Expose()
  @IsString()
  @IsOptional()
  assigned_user_id?: string | null;

  @Expose()
  @IsString()
  priority: 'Low' | 'Medium' | 'Urgent';
}

export class CreateClinicServiceDto {
  @Expose()
  @IsString()
  service_name: string;

  @Expose()
  @IsString()
  @IsOptional()
  default_medical_record_note?: string | null;

  @Expose()
  @IsString()
  description: string;

  @Expose()
  @IsNumber()
  duration_minutes: number;

  @Expose()
  @IsNumber()
  price: number;

  @Expose()
  @IsBoolean()
  is_active: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  type?: 'Injections' | 'Medication' | 'Product' | 'Service' | 'Vaccine' | null;

  @Expose()
  @IsObject()
  @IsOptional()
  details?: any; // Complex nested object, validate as object

  @Expose()
  @IsBoolean()
  include_in_medical_record: boolean;

  @Expose()
  @IsBoolean()
  include_on_invoice_if_declined: boolean;

  @Expose()
  @IsString()
  invoice_line_name: string;

  @Expose()
  @IsString()
  @IsOptional()
  inventory_id?: string | null;

  @Expose()
  @ValidateNested()
  @Type(() => ServicesProductsPriceSettingDto)
  price_setting: ServicesProductsPriceSettingDto;

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


