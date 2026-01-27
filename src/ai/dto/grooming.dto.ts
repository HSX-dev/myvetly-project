import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GroomingPlanRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsEnum(['haircut_and_bath', 'nails', 'dental', 'ears', 'full_plan'])
  category?: 'haircut_and_bath' | 'nails' | 'dental' | 'ears' | 'full_plan';
}

export interface GroomingCategory {
  category: string;
  frequency: string;
  method: string;
  products: string[];
  tips: string[];
  warning_signs: string[];
  breed_specific_notes: string;
}

export class GroomingPlanResponseDto {
  success: boolean;
  data: {
    category: string;
    haircut_and_bath?: GroomingCategory;
    nails?: GroomingCategory;
    dental?: GroomingCategory;
    ears?: GroomingCategory;
    // For single category requests
    frequency?: string;
    method?: string;
    products?: string[];
    tips?: string[];
    warning_signs?: string[];
    breed_specific_notes?: string;
  };
  pet: {
    id: string;
    name: string;
    breed: string;
    species: string;
  };
  rate_limit: {
    remaining: number;
    reset_time: string;
  };
}
