import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreatePaymentLinkDto {
  @IsString()
  invoiceId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;
}


