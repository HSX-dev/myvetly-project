import { IsString, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class CloseSessionDto {
  @Expose()
  @IsString()
  @IsOptional()
  reason?: string;
}



