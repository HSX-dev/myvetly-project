import { IsString, IsNumber, IsOptional } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class CreatePaymentLinkDto {
  // Support both invoice_id (snake_case) and invoiceId (camelCase)
  @Expose()
  @IsOptional()
  @IsString()
  invoice_id?: string;

  @Expose()
  @IsString({ message: 'invoiceId must be a string' })
  @Transform(({ value, obj }) => {
    // Prioritize invoiceId, fallback to invoice_id
    if (value && typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (obj && obj.invoice_id && typeof obj.invoice_id === 'string' && obj.invoice_id.trim() !== '') {
      return obj.invoice_id.trim();
    }
    return value;
  })
  invoiceId: string;

  @Expose()
  @IsOptional()
  @IsNumber({}, { message: 'amount must be a number' })
  @Transform(({ value }) => {
    // Convert string to number if needed
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  amount?: number;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  clientName?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  clientEmail?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;
}


