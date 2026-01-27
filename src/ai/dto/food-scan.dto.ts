import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

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
  food_type?: string;

  @IsOptional()
  @IsEnum(['label', 'food_item', 'package'])
  scan_type?: string;
}

export interface FoodIngredient {
  name: string;
  is_toxic: boolean;
  severity?: number;
  notes?: string;
}

export interface ToxicIngredient {
  name: string;
  severity: number;
  symptoms: string;
  action_required: 'immediate_vet' | 'monitor_closely' | 'avoid_future';
}

export interface NutritionalValue {
  protein_percent: number | null;
  fat_percent: number | null;
  carbs_percent: number | null;
  fiber_percent: number | null;
  quality_rating: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
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
  level: 'critical' | 'warning' | 'info';
  message: string;
}

export class FoodScanResponseDto {
  scan_id: string;
  analysis: {
    food_name: string;
    food_type: string;
    scan_type: string;
    safety_rating: 'safe' | 'caution' | 'toxic' | 'unknown';
    toxicity_score: number;
    ingredients: FoodIngredient[];
    toxic_ingredients: ToxicIngredient[];
    nutritional_value: NutritionalValue;
    recommended_serving: RecommendedServing;
    warnings: FoodWarning[];
    health_benefits: string | null;
    confidence: number;
    notes: string;
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
