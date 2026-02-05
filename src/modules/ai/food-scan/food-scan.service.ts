import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  FoodScanRequestDto,
  FoodScanResponseDto,
  FoodScanAnalysis,
  getPawMDScoreLabel,
} from './food-scan.dto';
import { BadRequestException } from '../../../common/exceptions';
import { fetchImagesAsBase64 } from '../shared/image-utils';

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

  async analyze(
    dto: FoodScanRequestDto,
    userId: string,
  ): Promise<FoodScanResponseDto> {
    const startTime = Date.now();
    try {
    await this.checkRateLimit(
      `rate:foodscan:${userId}`,
      RATE_LIMITS.FOOD_SCAN.maxRequests,
      RATE_LIMITS.FOOD_SCAN.windowSeconds,
    );

    // Fetch pet with allergies and medical history
    const pet = await this.getPetById(
      dto.pet_id,
      'id, client_id, name, species, breed, weight, allergies, medical_history, birth_date',
    );

    // Build user prompt with pet context
    const userPrompt = this.buildUserPrompt(dto, pet);

    // Call AI - use GPT-4o for vision if images provided, otherwise GPT-4o-mini
    let response;
    let modelUsed: string;

    if (dto.image_urls && dto.image_urls.length > 0) {
      // Fetch images as base64 so OpenAI doesn't timeout downloading from Supabase
      const imageBase64 = await fetchImagesAsBase64(dto.image_urls);
      response = await this.analyzeWithImages(
        AI_PROMPTS.FOOD_SCAN_SYSTEM,
        userPrompt,
        imageBase64,
      );
      modelUsed = 'gpt-4o';
    } else {
      // Use GPT-4o-mini for text-only analysis
      response = await this.callOpenAI(AI_PROMPTS.FOOD_SCAN_SYSTEM, userPrompt, {
        temperature: 0.3,
        maxTokens: 1500,
      });
      modelUsed = 'gpt-4o-mini';
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<FoodScanAnalysis>(response.content);

    // Validate and fix safety rating alignment
    this.validateAndFixSafetyRating(result);

    // Validate PawMD score label
    this.validatePawMDScore(result);

    // Calculate cost
    const cost = this.calculateCost(response.tokensUsed, modelUsed);

    // Store scan in database (optional - return analysis even if insert fails)
    let scanId = '';
    const { data: scan, error: insertError } = await this.getSupabase()
      .from('food_scans')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        food_name: result.food_name || dto.food_name,
        food_type: result.food_type || dto.food_type,
        scan_type: result.scan_type || dto.scan_type || 'food_item',
        model_used: modelUsed,
        ai_response: result,
        safety_rating: result.safety_rating,
        toxicity_score: result.toxicity_score,
        pawmd_score: result.pawmd_score?.score,
        pawmd_score_data: result.pawmd_score,
        ingredients: result.ingredients || [],
        toxic_ingredients: result.toxic_ingredients || [],
        nutritional_value: result.nutritional_value,
        recommended_serving: result.recommended_serving,
        warnings: result.warnings || [],
        health_benefits: result.health_benefits,
        status: 'completed',
        latency_ms: latency,
        cost_usd: cost,
      })
      .select('id')
      .single();

    if (insertError) {
      this.logger.warn(
        `FoodScan DB insert failed (returning analysis anyway): ${insertError.message}. Code: ${insertError.code}. Details: ${JSON.stringify(insertError.details)}`,
      );
    } else {
      scanId = scan?.id || '';
    }

    this.logTiming('FoodScan analyze', startTime);

    return {
      scan_id: scanId,
      analysis: result,
      latency_ms: latency,
      cost_usd: cost,
      model: modelUsed,
    };
    } catch (err: any) {
      this.logger.error(
        `FoodScan analyze failed: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  /**
   * Analyze food with images using GPT-4o vision
   */
  private async analyzeWithImages(
    systemPrompt: string,
    userPrompt: string,
    images: string[], // base64 data URLs or URLs
  ): Promise<{ content: string; tokensUsed: number }> {
    const fullPrompt = `${userPrompt}

IMPORTANT: Analyze the attached image(s) to identify the food item or ingredient label. Be specific about what you see.`;

    // Use chatWithVision for proper system prompt support
    return this.openaiProvider.chatWithVision(
      systemPrompt,
      fullPrompt,
      images,
      [], // No chat history for food scan
      {
        model: 'gpt-4o',
        maxTokens: 1500,
        temperature: 0.3,
      },
    );
  }

  /**
   * Validate and fix safety rating to match toxicity score
   */
  private validateAndFixSafetyRating(result: FoodScanAnalysis): void {
    const score = result.toxicity_score;

    // Enforce safety rating alignment
    if (score <= 3 && result.safety_rating !== 'safe') {
      this.logger.warn(
        `Fixing safety_rating: toxicity_score ${score} should be "safe", was "${result.safety_rating}"`,
      );
      result.safety_rating = 'safe';
    } else if (score >= 4 && score <= 6 && result.safety_rating === 'safe') {
      this.logger.warn(
        `Fixing safety_rating: toxicity_score ${score} should be "caution", was "safe"`,
      );
      result.safety_rating = 'caution';
    } else if (score >= 7 && result.safety_rating !== 'toxic') {
      this.logger.warn(
        `Fixing safety_rating: toxicity_score ${score} should be "toxic", was "${result.safety_rating}"`,
      );
      result.safety_rating = 'toxic';
    }
  }

  /**
   * Validate PawMD score and fix label if needed
   */
  private validatePawMDScore(result: FoodScanAnalysis): void {
    if (!result.pawmd_score) {
      // Generate default PawMD score if missing
      result.pawmd_score = {
        score: this.calculateDefaultPawMDScore(result),
        label: 'acceptable',
        summary: 'Unable to fully assess this food item.',
        factors: {
          ingredient_quality: 50,
          nutritional_balance: 50,
          beneficial_components: 50,
          harmful_components: 50,
          pet_specific: 50,
        },
      };
    }

    // Ensure label matches score
    const correctLabel = getPawMDScoreLabel(result.pawmd_score.score);
    if (result.pawmd_score.label !== correctLabel) {
      this.logger.warn(
        `Fixing pawmd_score.label: score ${result.pawmd_score.score} should be "${correctLabel}", was "${result.pawmd_score.label}"`,
      );
      result.pawmd_score.label = correctLabel;
    }
  }

  /**
   * Calculate default PawMD score based on toxicity
   */
  private calculateDefaultPawMDScore(result: FoodScanAnalysis): number {
    // Inverse relationship with toxicity
    const toxicityPenalty = result.toxicity_score * 10;
    return Math.max(0, 100 - toxicityPenalty);
  }

  /**
   * Calculate cost based on tokens used
   */
  private calculateCost(tokensUsed: number, model: string): number {
    // GPT-4o pricing: ~$5 per 1M input, ~$15 per 1M output (averaged)
    if (model === 'gpt-4o') {
      return parseFloat(((tokensUsed / 1000) * 0.01).toFixed(6));
    }
    // GPT-4o-mini pricing
    return parseFloat(((tokensUsed / 1000) * 0.0004).toFixed(6));
  }

  /**
   * Build comprehensive user prompt with pet context
   */
  private buildUserPrompt(dto: FoodScanRequestDto, pet: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const species = (pet.species || 'dog').toLowerCase();

    return `FOOD SAFETY ANALYSIS REQUEST

PET PROFILE:
- Name: ${pet.name}
- Species: ${pet.species || 'Unknown'}
- Breed: ${pet.breed || 'Unknown'}
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Known Allergies: ${pet.allergies || 'None'}
- Medical History: ${pet.medical_history || 'None'}

FOOD TO ANALYZE:
- Food Name: ${dto.food_name || 'Identify from image/description'}
- Food Type: ${dto.food_type || 'Unknown'}
- Scan Type: ${dto.scan_type || 'food_item'}
${dto.image_urls && dto.image_urls.length > 0 ? '- Images provided: Yes (analyze the image carefully)' : '- Images provided: No'}

TASK:
1. Identify the food item (be specific - include brand if visible)
2. Check for toxic ingredients using the ${species.toUpperCase()} toxic foods database
3. Calculate toxicity_score (0-10) and set safety_rating accordingly
4. Calculate PawMD Score (0-100) considering:
   - Ingredient quality for ${species}s
   - Nutritional balance appropriate for ${species}s
   - Beneficial components
   - Harmful components (use toxic database)
   - Pet-specific factors (${pet.name}'s allergies: ${pet.allergies || 'None'})
5. Provide specific serving recommendations based on ${pet.weight || 'average'} lbs weight

Return JSON only.`;
  }
}
