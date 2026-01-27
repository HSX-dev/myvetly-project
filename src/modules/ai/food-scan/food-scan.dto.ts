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

export class FoodScanResponseDto {
  scan_id: string;
  analysis: {
    food_name: string;
    food_type: string;
    scan_type: string;
    safety_rating: 'safe' | 'caution' | 'toxic' | 'unknown';
    toxicity_score: number;
    ingredients: any[];
    toxic_ingredients: any[];
    nutritional_value: any;
    recommended_serving: any;
    warnings: any[];
    health_benefits: string | null;
    confidence: number;
    notes: string;
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
