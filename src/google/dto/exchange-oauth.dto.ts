import { IsString } from 'class-validator';

export class ExchangeOAuthDto {
  @IsString()
  code: string;

  @IsString()
  redirect_uri: string;
}


