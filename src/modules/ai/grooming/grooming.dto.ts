import { IsString, IsOptional, IsEnum } from 'class-validator';

// ============================================
// Request Types
// ============================================

export type GroomingCategory =
  | 'haircut_and_bath'
  | 'nails'
  | 'dental'
  | 'ears'
  | 'full_plan';

export class GroomingPlanRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsEnum(['haircut_and_bath', 'nails', 'dental', 'ears', 'full_plan'])
  category?: GroomingCategory;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// ============================================
// Category Plan Types
// ============================================

export interface GroomingCategoryPlan {
  category: string;
  frequency: string;
  method: string;
  products: string[];
  tips: string[];
  warning_signs: string[];
  breed_specific_notes: string;
}

// ============================================
// Full Plan Type (all categories)
// ============================================

export interface FullGroomingPlan {
  category: 'full_plan';
  haircut_and_bath: GroomingCategoryPlan;
  nails: GroomingCategoryPlan;
  dental: GroomingCategoryPlan;
  ears: GroomingCategoryPlan;
}

// ============================================
// Response Types
// ============================================

export interface PetInfo {
  id: string;
  name: string;
  breed: string;
  species: string;
}

export class GroomingPlanResponseDto {
  success: boolean;
  data: GroomingCategoryPlan | FullGroomingPlan;
  pet: PetInfo;
  latency_ms: number;
  cost_usd?: number;
  model?: string;
  has_allergies?: boolean;
  has_skin_issues?: boolean;
}

// ============================================
// Grooming Log (from DB)
// ============================================

export interface GroomingLog {
  id?: string;
  pet_id: string;
  category: GroomingCategory;
  logged_at: string;
  details?: string;
}

// ============================================
// Category Prompt Map
// ============================================

export const CATEGORY_LABELS: Record<GroomingCategory, string> = {
  haircut_and_bath: 'Haircut and Bath',
  nails: 'Nail Trimming',
  dental: 'Dental Care',
  ears: 'Ear Cleaning',
  full_plan: 'Complete Grooming Plan',
};
