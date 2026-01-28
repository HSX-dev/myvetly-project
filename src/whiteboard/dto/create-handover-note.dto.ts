import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateHandoverNoteDto {
  @IsString()
  note_text: string;

  @IsOptional()
  @IsString()
  shift_date?: string;

  @IsEnum(['AM', 'PM', 'Night'])
  shift_type: 'AM' | 'PM' | 'Night';
}


