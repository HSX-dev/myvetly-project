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
  images?: string[]; // base64 strings or URLs

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[]; // PDF/DOCX URLs

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

export interface ChatMetadata {
  pet_context_used: boolean;
  appointments_referenced: boolean;
  model_used: string;
  used_fallback: boolean;
  cost_usd: number;
}

export class ChatResponseDto {
  response: string;
  session_id: string;
  tokens_used?: number;
  metadata?: ChatMetadata;
}
