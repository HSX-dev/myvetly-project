import { IsString } from 'class-validator';

export class NutritionAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;
}

export interface MealPlan {
  meals_per_day: number;
  meals: {
    time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
    portion_size_description: string;
    composition: string;
  }[];
}

export interface RecommendedFoodTypes {
  kibble: string[] | null;
  raw: {
    proteins: string[];
    veggies: string[];
    grains: string[];
    oils: string[];
  } | null;
  home_cooked: {
    proteins: string[];
    veggies: string[];
    grains: string[];
    oils: string[];
  } | null;
}

export interface TreatGuidelines {
  daily_amount: string;
  types: string[];
}

export interface TransitionPlan {
  duration_days: number;
  schedule: string;
}

export class NutritionAnalyzeResponseDto {
  success: boolean;
  data: {
    calorie_target_per_day: number;
    meal_plan: MealPlan;
    recommended_food_types: RecommendedFoodTypes;
    treat_guidelines: TreatGuidelines;
    transition_plan: TransitionPlan;
    special_considerations: string;
    red_flag_foods: string[];
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
