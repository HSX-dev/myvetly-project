import { IsOptional, IsString } from 'class-validator';

export class RejectInvoiceItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

