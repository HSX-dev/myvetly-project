import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber } from 'class-validator';
import { Expose } from 'class-transformer';

export class SendMessageDto {
  // Note: session_id is NOT validated here - it comes from URL parameter
  // The controller sets it on the DTO object after validation
  // We don't use @Expose() so it's excluded from validation
  session_id?: string;

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


