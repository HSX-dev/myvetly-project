import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { FoodScanRequestDto, FoodScanResponseDto } from './food-scan.dto';

@Injectable()
export class FoodScanService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(dto: FoodScanRequestDto, userId: string): Promise<FoodScanResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:foodscan:${userId}`,
      RATE_LIMITS.FOOD_SCAN.maxRequests,
      RATE_LIMITS.FOOD_SCAN.windowSeconds,
    );

    const pet = await this.getPetById(dto.pet_id, 'id, client_id, name, species, breed, weight');

    const userPrompt = this.buildUserPrompt(dto, pet);
    const response = await this.callOpenAI(AI_PROMPTS.FOOD_SCAN_SYSTEM, userPrompt, {
      temperature: 0.3,
      maxTokens: 1200,
    });

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse(response.content);

    // Store scan in database
    const { data: scan } = await this.getSupabase()
      .from('food_scans')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        food_name: result.food_name || dto.food_name,
        food_type: result.food_type || dto.food_type,
        scan_type: result.scan_type || dto.scan_type || 'food_item',
        model_used: 'gpt-4o-mini',
        ai_response: result,
        safety_rating: result.safety_rating,
        toxicity_score: result.toxicity_score,
        ingredients: result.ingredients || [],
        toxic_ingredients: result.toxic_ingredients || [],
        nutritional_value: result.nutritional_value,
        recommended_serving: result.recommended_serving,
        warnings: result.warnings || [],
        health_benefits: result.health_benefits,
        status: 'completed',
        latency_ms: latency,
      })
      .select('id')
      .single();

    this.logTiming('FoodScan analyze', startTime);

    return {
      scan_id: scan?.id,
      analysis: result,
      latency_ms: latency,
      cost_usd: 0,
      model: 'gpt-4o-mini',
    };
  }

  private buildUserPrompt(dto: FoodScanRequestDto, pet: any): string {
    return `FOOD SAFETY ANALYSIS

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.weight}kg)

FOOD:
- Name: ${dto.food_name || 'Analyze from description'}
- Type: ${dto.food_type || 'Unknown'}

Analyze if this food is safe for this pet. Return JSON only.`;
  }
}
