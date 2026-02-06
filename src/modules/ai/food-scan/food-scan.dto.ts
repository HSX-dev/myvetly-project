import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

// ============================================
// Request Types
// ============================================

export type FoodType =
  | 'kibble'
  | 'wet_food'
  | 'raw'
  | 'treat'
  | 'human_food'
  | 'supplement'
  | 'other';

export type ScanType = 'label' | 'food_item' | 'package';
export type SafetyRating = 'safe' | 'caution' | 'toxic' | 'unknown';
export type ActionRequired = 'immediate_vet' | 'monitor_closely' | 'avoid_future';
export type QualityRating = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
export type WarningLevel = 'critical' | 'warning' | 'info';
export type PawMDScoreLabel = 'excellent' | 'good' | 'acceptable' | 'poor' | 'avoid';

export class FoodScanRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_urls?: string[];

  @IsOptional()
  @IsString()
  food_name?: string;

  @IsOptional()
  @IsEnum(['kibble', 'wet_food', 'raw', 'treat', 'human_food', 'supplement', 'other'])
  food_type?: FoodType;

  @IsOptional()
  @IsEnum(['label', 'food_item', 'package'])
  scan_type?: ScanType;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// ============================================
// Ingredient Types
// ============================================

export interface FoodIngredient {
  name: string;
  is_toxic: boolean;
  severity?: number; // 1-10, only if toxic
  notes: string;
}

export interface ToxicIngredient {
  name: string;
  severity: number; // 1-10
  symptoms: string;
  action_required: ActionRequired;
}

// ============================================
// Nutritional Types
// ============================================

export interface NutritionalValue {
  protein_percent?: number | null;
  fat_percent?: number | null;
  carbs_percent?: number | null;
  fiber_percent?: number | null;
  quality_rating: QualityRating;
  notes: string;
}

export interface RecommendedServing {
  safe_to_give: boolean;
  serving_size: string;
  frequency: string;
  max_daily_amount: string;
  notes: string;
}

export interface FoodWarning {
  level: WarningLevel;
  message: string;
}

// ============================================
// PawMD Score Types (NEW)
// ============================================

export interface PawMDScoreFactors {
  ingredient_quality: number; // 0-100
  nutritional_balance: number; // 0-100
  beneficial_components: number; // 0-100
  harmful_components: number; // 0-100 (inverted - higher is better, meaning fewer harmful)
  pet_specific: number; // 0-100
}

export interface PawMDScore {
  score: number; // 0-100
  label: PawMDScoreLabel;
  summary: string; // 1-2 sentence explanation
  factors: PawMDScoreFactors;
}

// ============================================
// Analysis Result Types
// ============================================

export interface FoodScanAnalysis {
  food_name: string;
  food_type: FoodType;
  scan_type: ScanType;
  safety_rating: SafetyRating;
  toxicity_score: number; // 0-10 (Risk Level - stays)
  pawmd_score: PawMDScore; // NEW - overall health score
  ingredients: FoodIngredient[];
  toxic_ingredients: ToxicIngredient[];
  nutritional_value: NutritionalValue;
  recommended_serving: RecommendedServing;
  warnings: FoodWarning[];
  health_benefits: string | null;
  confidence: number; // 0-100
  notes: string;
}

// ============================================
// Response Types
// ============================================

export class FoodScanResponseDto {
  scan_id: string;
  analysis: FoodScanAnalysis;
  latency_ms: number;
  cost_usd: number;
  model: string;
}

// ============================================
// PawMD Score Label Mapping
// ============================================

export function getPawMDScoreLabel(score: number): PawMDScoreLabel {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'acceptable';
  if (score >= 30) return 'poor';
  return 'avoid';
}

export const PAWMD_SCORE_LABELS: Record<PawMDScoreLabel, string> = {
  excellent: 'Excellent Choice',
  good: 'Good Choice',
  acceptable: 'Acceptable',
  poor: 'Poor Choice',
  avoid: 'Avoid',
};
