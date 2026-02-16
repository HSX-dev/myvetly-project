import { IsNumber, IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdateInvoiceDto {
  @Expose()
  @IsNumber()
  @IsOptional()
  amount?: number;

  @Expose()
  @IsEnum(['Active', 'Charges Complete', 'Checked Out'])
  @IsOptional()
  status?: 'Active' | 'Charges Complete' | 'Checked Out';

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  treatments?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  prescriptions?: string[];

  @Expose()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  invoice_items?: string[];

  @Expose()
  @IsNumber()
  @IsOptional()
  amount_paid?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  amount_refunded?: number;

  @Expose()
  @IsString()
  @IsOptional()
  paid_at?: string;

  @Expose()
  @IsString()
  @IsOptional()
  stripe_invoice?: string;
}


