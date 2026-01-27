import { IsString, IsOptional, IsObject } from 'class-validator';

export class SoapExpandRequestDto {
  @IsString()
  appointment_id: string;

  @IsOptional()
  @IsString()
  section?: 'subjective' | 'objective' | 'assessment' | 'plan' | 'all';

  @IsOptional()
  @IsObject()
  current_data?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
}

export class SoapExpandResponseDto {
  appointment_id: string;
  expanded: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  snapshot_id?: string;
}

export class SoapUndoRequestDto {
  @IsString()
  snapshot_id: string;
}
