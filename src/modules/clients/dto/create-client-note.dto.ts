import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateClientNoteDto {
  // client_id comes from URL parameter, not request body
  @Expose()
  @IsUUID()
  @IsOptional()
  client_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  title?: string;

  // content is required and must be a non-empty string
  @Expose()
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content should not be empty' })
  content: string;

  // clinic_id comes from user context, not request body
  @Expose()
  @IsUUID()
  @IsOptional()
  clinic_id?: string;
}

