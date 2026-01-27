import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GroomingPlanRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsEnum(['haircut_and_bath', 'nails', 'dental', 'ears', 'full_plan'])
  category?: 'haircut_and_bath' | 'nails' | 'dental' | 'ears' | 'full_plan';
}

export class GroomingPlanResponseDto {
  success: boolean;
  data: any;
  pet: {
    id: string;
    name: string;
    breed: string;
    species: string;
  };
  latency_ms: number;
}
