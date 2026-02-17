import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdateClientNoteDto {
  @Expose()
  @IsString()
  @IsOptional()
  title?: string;

  @Expose()
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content should not be empty' })
  content: string;
}

