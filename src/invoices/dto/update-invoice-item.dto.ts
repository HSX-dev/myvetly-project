import { IsNumber, IsString, IsUUID, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdateInvoiceItemDto {
  @Expose()
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @Expose()
  @IsUUID()
  @IsOptional()
  service_id?: string;

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
}

