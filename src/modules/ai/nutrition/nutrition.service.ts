import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { NutritionAnalyzeRequestDto, NutritionAnalyzeResponseDto } from './nutrition.dto';
import { NotFoundException } from '../../../common/exceptions';

@Injectable()
export class NutritionService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(dto: NutritionAnalyzeRequestDto, userId: string): Promise<NutritionAnalyzeResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:nutrition:${userId}`,
      RATE_LIMITS.NUTRITION.maxRequests,
      RATE_LIMITS.NUTRITION.windowSeconds,
    );

    // Get pet and preferences in parallel
    const [petResult, prefResult] = await Promise.all([
      this.getSupabase().from('pets').select('*').eq('id', dto.pet_id).single(),
      this.getSupabase().from('pet_nutrition_preferences').select('*').eq('id', dto.preference_id).single(),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }
    if (prefResult.error || !prefResult.data) {
      throw new NotFoundException('Nutrition preferences', dto.preference_id);
    }

    const pet = petResult.data;
    const prefs = prefResult.data;

    const userPrompt = this.buildUserPrompt(pet, prefs);
    const response = await this.callOpenAI(AI_PROMPTS.NUTRITION_SYSTEM, userPrompt, {
      temperature: 0.7,
      maxTokens: 1500,
    });

    const result = this.parseJsonResponse(response.content);

    this.logTiming('Nutrition analyze', startTime);

    return {
      success: true,
      data: result,
      latency_ms: Date.now() - startTime,
      cost_usd: 0,
      model: 'gpt-4o-mini',
    };
  }

  private buildUserPrompt(pet: any, prefs: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    return `NUTRITION PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Allergies: ${pet.allergies || 'None'}

PREFERENCES:
- Diet: ${prefs.diet_style || 'Not specified'}
- Goal: ${prefs.goal || 'maintain'}
- Budget: ${prefs.budget_preference || 'Not specified'}

Create a nutrition plan. Return JSON:
{
  "calorie_target_per_day": number,
  "meal_plan": {"meals_per_day": number, "meals": [{"time_of_day": "morning|evening", "portion_size_description": "string", "composition": "string"}]},
  "recommended_food_types": {"kibble": ["string"] or null, "raw": {"proteins": [], "veggies": [], "grains": [], "oils": []} or null},
  "treat_guidelines": {"daily_amount": "string", "types": ["string"]},
  "transition_plan": {"duration_days": number, "schedule": "string"},
  "special_considerations": "string",
  "red_flag_foods": ["string"]
}`;
  }
}
