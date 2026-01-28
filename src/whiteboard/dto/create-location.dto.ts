import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsEnum(['exam_room', 'treatment', 'surgery', 'icu', 'other'])
  type: 'exam_room' | 'treatment' | 'surgery' | 'icu' | 'other';

  @IsOptional()
  @IsNumber()
  capacity?: number;
}


