import { IsString, IsOptional } from 'class-validator';

// ============================================
// Request Types
// ============================================

export class NutritionAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// ============================================
// Diet & Goal Types
// ============================================

export type DietStyle = 'kibble' | 'canned' | 'raw' | 'home_cooked' | 'mixed';
export type NutritionGoal = 'maintain' | 'weight_loss' | 'weight_gain' | 'not_sure';
export type BudgetPreference = 'low' | 'medium' | 'high';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// ============================================
// Meal Plan Types
// ============================================

export interface Meal {
  time_of_day: TimeOfDay;
  portion_size_description: string;
  composition: string;
}

export interface MealPlan {
  meals_per_day: number;
  meals: Meal[];
}

// ============================================
// Food Recommendation Types
// ============================================

export interface RawFoodRecommendations {
  proteins: string[];
  veggies: string[];
  grains: string[];
  oils: string[];
}

export interface RecommendedFoodTypes {
  kibble: string[] | null;
  raw: RawFoodRecommendations | null;
  home_cooked: RawFoodRecommendations | null;
}

// ============================================
// Treat & Transition Types
// ============================================

export interface TreatGuidelines {
  daily_amount: string;
  types: string[];
}

export interface TransitionPlan {
  duration_days: number;
  schedule: string;
}

// ============================================
// Nutrition Plan Result
// ============================================

export interface NutritionPlanResult {
  calorie_target_per_day: number;
  meal_plan: MealPlan;
  recommended_food_types: RecommendedFoodTypes;
  treat_guidelines: TreatGuidelines;
  transition_plan: TransitionPlan;
  special_considerations: string;
  red_flag_foods: string[];
}

// ============================================
// Response Types
// ============================================

export class NutritionAnalyzeResponseDto {
  success: boolean;
  data: NutritionPlanResult;
  latency_ms: number;
  cost_usd: number;
  model: string;
  activity_level_used?: number;
}

// ============================================
// Nutrition Preferences (from DB)
// ============================================

export interface NutritionPreferences {
  id: string;
  pet_id: string;
  diet_style: DietStyle;
  food_brand_recipe?: string;
  main_proteins?: string;
  main_carbs?: string;
  goal: NutritionGoal;
  allergies_intolerances?: string[];
  budget_preference?: BudgetPreference;
  meal_frequency?: number;
  created_at?: string;
  updated_at?: string;
}
