import { IsString, IsOptional } from 'class-validator';

export class CloseSessionDto {
  @IsString()
  reason?: string;
}



