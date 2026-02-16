import { IsNumber, IsString, IsEnum, IsArray, IsOptional, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateInvoiceDto {
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

  // These come from URL params or user context, not request body
  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  appointment_id?: string;
}


