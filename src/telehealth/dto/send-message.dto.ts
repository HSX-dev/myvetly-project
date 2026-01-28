import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber } from 'class-validator';
import { Expose } from 'class-transformer';

export class SendMessageDto {
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  session_id: string;

  @Expose()
  @IsString()
  @IsOptional()
  content?: string;

  @Expose()
  @IsEnum(['text', 'image', 'file', 'system'])
  @IsOptional()
  message_type?: 'text' | 'image' | 'file' | 'system';

  @Expose()
  @IsString()
  @IsOptional()
  media_url?: string;

  @Expose()
  @IsString()
  @IsOptional()
  file_name?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  file_size?: number;
}

