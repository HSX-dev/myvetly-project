import { IsString, IsOptional } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class ExchangeOAuthDto {
  @Expose()
  @IsString({ message: 'code must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  code: string;

  @Expose()
  @IsOptional()
  @IsString({ message: 'redirect_uri must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  redirect_uri?: string;
}


