import { IsString } from 'class-validator';

export class NutritionAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;
}

export class NutritionAnalyzeResponseDto {
  success: boolean;
  data: {
    calorie_target_per_day: number;
    meal_plan: any;
    recommended_food_types: any;
    treat_guidelines: any;
    transition_plan: any;
    special_considerations: string;
    red_flag_foods: string[];
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
