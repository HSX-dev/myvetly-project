import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  NutritionAnalyzeRequestDto,
  NutritionAnalyzeResponseDto,
  NutritionPlanResult,
  NutritionPreferences,
  DietStyle,
  NutritionGoal,
} from './nutrition.dto';
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

  async analyze(
    dto: NutritionAnalyzeRequestDto,
    userId: string,
  ): Promise<NutritionAnalyzeResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:nutrition:${userId}`,
      RATE_LIMITS.NUTRITION.maxRequests,
      RATE_LIMITS.NUTRITION.windowSeconds,
    );

    // Fetch all required data in parallel
    const [petResult, prefs, activityLogs] = await Promise.all([
      this.getSupabase().from('pets').select('*').eq('id', dto.pet_id).single(),
      this.supabaseService.getNutritionPreferences(dto.preference_id),
      this.supabaseService.getActivityLogs(dto.pet_id, 30),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const pet = petResult.data;

    // Calculate average activity level (1-10 scale)
    const avgActivity = this.calculateAverageActivity(activityLogs);

    // Build comprehensive user prompt
    const userPrompt = this.buildUserPrompt(pet, prefs, avgActivity);

    // Call AI (use DeepSeek for cost efficiency, like the old edge function)
    let response;
    try {
      response = await this.callDeepSeek(
        AI_PROMPTS.NUTRITION_SYSTEM,
        userPrompt,
        {
          temperature: 0.7,
          maxTokens: 1500,
        },
      );
    } catch (error) {
      // Fallback to OpenAI if DeepSeek fails
      this.logger.warn('DeepSeek failed, falling back to OpenAI');
      response = await this.callOpenAI(
        AI_PROMPTS.NUTRITION_SYSTEM,
        userPrompt,
        {
          temperature: 0.7,
          maxTokens: 1500,
        },
      );
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<NutritionPlanResult>(response.content);

    // Calculate cost (DeepSeek pricing)
    const cost = this.calculateCost(response.tokensUsed, 'deepseek');

    // Store nutrition plan in database
    await this.supabaseService.storeNutritionPlan(dto.pet_id, dto.preference_id, result, {
      model: 'deepseek-chat',
      latency_ms: latency,
      cost_usd: cost,
    });

    this.logTiming('Nutrition analyze', startTime);

    return {
      success: true,
      data: result,
      latency_ms: latency,
      cost_usd: cost,
      model: 'deepseek-chat',
      activity_level_used: avgActivity,
    };
  }

  /**
   * Calculate average activity level from logs
   * Returns 5 (moderate) if no logs available
   */
  private calculateAverageActivity(activityLogs: any[]): number {
    if (!activityLogs || activityLogs.length === 0) {
      return 5; // Default to moderate activity
    }

    const sum = activityLogs.reduce((acc, log) => {
      const level = Number(log.activity_level) || 0;
      return acc + level;
    }, 0);

    return parseFloat((sum / activityLogs.length).toFixed(1));
  }

  /**
   * Calculate cost based on tokens used
   */
  private calculateCost(tokensUsed: number, model: string): number {
    // DeepSeek pricing: ~$0.14 per 1M input tokens, ~$0.28 per 1M output tokens
    // Simplified: average $0.0002 per 1K tokens
    if (model === 'deepseek') {
      return parseFloat(((tokensUsed / 1000) * 0.0002).toFixed(6));
    }
    // GPT-4o-mini pricing: ~$0.15 per 1M input, ~$0.60 per 1M output
    return parseFloat(((tokensUsed / 1000) * 0.0004).toFixed(6));
  }

  /**
   * Build comprehensive user prompt with all pet data
   */
  private buildUserPrompt(
    pet: any,
    prefs: NutritionPreferences,
    avgActivity: number,
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : null;
    const ageStr = age !== null ? `${age} years` : 'Unknown';

    // Map diet style to readable format
    const dietStyleMap: Record<DietStyle, string> = {
      kibble: 'Kibble/Dry food',
      canned: 'Canned/Wet food',
      raw: 'Raw',
      home_cooked: 'Home-cooked',
      mixed: 'Mixed diet',
      pawla_decide: 'Let AI decide based on breed, age, and health',
    };

    // Map goal to readable format
    const goalMap: Record<NutritionGoal, string> = {
      maintain: 'Maintain weight',
      weight_loss: 'Weight loss',
      weight_gain: 'Weight gain',
      not_sure: 'Not sure (default to maintain)',
    };

    const isPawlaDecide = prefs.diet_style === 'pawla_decide';

    const ownerPrefsSection = isPawlaDecide
      ? `OWNER PREFERENCES:
- Diet Style: AI MUST DECIDE the optimal diet style (kibble, raw, home-cooked, canned, or mixed) based on:
  - Breed-specific nutritional needs (${pet.breed || 'Unknown'})
  - Age and life stage (${ageStr})
  - Health conditions and medical history
  - Activity level (${avgActivity}/10)
${prefs.diet_hint ? `  - Owner hint/preference: "${prefs.diet_hint}"` : ''}
- Current Food: ${prefs.food_brand_recipe || 'Not specified'}

First determine the best diet style for this pet, then provide the full nutrition plan including recommended proteins and carbs.`
      : `OWNER PREFERENCES:
- Diet Style: ${dietStyleMap[prefs.diet_style] || prefs.diet_style}
- Current Food: ${prefs.food_brand_recipe || 'Not specified'}
${prefs.main_proteins ? `- Main Proteins: ${prefs.main_proteins}` : ''}
${prefs.main_carbs ? `- Main Carbs: ${prefs.main_carbs}` : ''}`;

    return `NUTRITION PLAN REQUEST

PET PROFILE:
- Name: ${pet.name}
- Species: ${pet.species || 'Unknown'}
- Breed: ${pet.breed || 'Unknown'}
- Age: ${ageStr}
- Sex: ${pet.gender || pet.sex || 'Unknown'}
- Current Weight: ${pet.weight || 'Unknown'} lbs
- Ideal Weight: ${pet.ideal_weight || 'Not specified'}
- Activity Level: ${avgActivity}/10 (average from 30-day logs)
- Known Allergies: ${pet.allergies || 'None'}
- Medical History: ${pet.medical_history || 'None recorded'}

${ownerPrefsSection}
- Goal: ${goalMap[prefs.goal] || prefs.goal}
- Allergies/Intolerances: ${prefs.allergies_intolerances?.length ? prefs.allergies_intolerances.join(', ') : 'None'}
- Budget Preference: ${prefs.budget_preference ? prefs.budget_preference.charAt(0).toUpperCase() + prefs.budget_preference.slice(1) : 'Not specified'}
- Meal Frequency: ${prefs.meal_frequency ? `${prefs.meal_frequency} times/day` : 'Let AI suggest'}

TASK: Create a comprehensive, personalized nutrition plan that includes:

1. **Daily Calorie Target**: Calculate based on species, breed, age, weight, activity level (${avgActivity}/10), and goal (${prefs.goal})
2. **Meal Plan**: 
   - Number of meals per day (consider species, age, and owner preference)
   - For each meal: time of day, portion size description (cups/grams or % of body weight), and composition
3. **Recommended Food Types**:
   - For kibble: Suggest generic types (NOT brand names) - e.g., "High-protein adult formula"
   - For raw/home-cooked: List recommended proteins, veggies, grains, and oils
4. **Treat Guidelines**: Daily amount and types of treats that fit within calorie budget
5. **Transition Plan**: 7-14 day schedule for moving from current diet to new plan
6. **Special Considerations**: Address breed-specific needs, health conditions, age-related requirements
7. **Red Flag Foods**: Short list of foods to avoid for this species/breed/condition

Return JSON only.`;
  }

}
