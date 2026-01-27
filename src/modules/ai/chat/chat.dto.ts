import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  pet_id?: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

export class ChatResponseDto {
  response: string;
  session_id: string;
  tokens_used?: number;
}
