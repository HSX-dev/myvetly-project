import { IsNumber, IsString, IsUUID, IsOptional, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateInvoiceItemDto {
  @Expose()
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @Expose()
  @IsUUID()
  @IsNotEmpty()
  service_id: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  patient_id?: string | null;

  @Expose()
  @IsString()
  @IsOptional()
  item_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  item_volume?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  item_price?: number;

  // These come from URL params or user context, not request body
  @Expose()
  @IsUUID()
  @IsOptional()
  invoice_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  clinic_id?: string;

  @Expose()
  @IsUUID()
  @IsOptional()
  created_by?: string;
}


