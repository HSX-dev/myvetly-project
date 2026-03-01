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
  /** Severity >= this → PawMD score forced to 0 */
  private readonly SEVERITY_SCORE_ZERO = 7;
  /** Max PawMD score when any toxic ingredient present (severity 1–6) */
  private readonly SCORE_CAP_ANY_TOXIC = 30;
  /** Per-point severity penalty: max score = SCORE_CAP_ANY_TOXIC - (maxSeverity * SEVERITY_PENALTY) */
  private readonly SEVERITY_PENALTY = 5;

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

    const hasBase64 = dto.image_base64 && dto.image_base64.length > 0;
    const hasUrls = dto.image_urls && dto.image_urls.length > 0;

    if (hasBase64 || hasUrls) {
      // Prefer base64 if provided (avoids extra fetch), otherwise fetch from URLs
      let imageBase64: string[];
      if (hasBase64) {
        imageBase64 = dto.image_base64!.map((b64) =>
          b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`,
        );
        this.logger.debug('Using provided base64 images, skipping URL fetch');
      } else {
        imageBase64 = await fetchImagesAsBase64(dto.image_urls!);
      }

      // Two-tier strategy: try gpt-5-mini first (fast), escalate to gpt-4o if empty or needed
      response = await this.analyzeWithImages(
        AI_PROMPTS.FOOD_SCAN_SYSTEM,
        userPrompt,
        imageBase64,
        'gpt-5-mini',
      );
      modelUsed = 'gpt-5-mini';

      const emptyContent = !response?.content?.trim();
      if (emptyContent) {
        this.logger.warn('FoodScan: gpt-5-mini returned empty content, escalating to gpt-4o');
        response = await this.analyzeWithImages(
          AI_PROMPTS.FOOD_SCAN_SYSTEM,
          userPrompt,
          imageBase64,
          'gpt-4o',
        );
        modelUsed = 'gpt-4o';
      } else {
        const firstResult = this.parseJsonResponse<FoodScanAnalysis>(response.content);
        if (this.needsEscalation(firstResult)) {
          this.logger.debug('Escalating to gpt-4o for better analysis');
          response = await this.analyzeWithImages(
            AI_PROMPTS.FOOD_SCAN_SYSTEM,
            userPrompt,
            imageBase64,
            'gpt-4o',
          );
          modelUsed = 'gpt-4o';
        }
      }
    } else {
      // Use gpt-5-mini for text-only analysis
      const textOptions: { temperature: number; maxTokens: number; responseFormat: 'json'; model: string } = {
        temperature: 0.3,
        maxTokens: 1400,
        responseFormat: 'json',
        model: 'gpt-5-mini',
      };
      response = await this.callOpenAI(AI_PROMPTS.FOOD_SCAN_SYSTEM, userPrompt, textOptions);
      modelUsed = 'gpt-5-mini';
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<FoodScanAnalysis>(response.content);

    // Enforce: toxic_ingredients and severity drive score, recommendation, and risk (single source of truth)
    this.enforceToxicityConsistency(result);

    // Validate and fix safety rating alignment (uses result.toxicity_score)
    this.validateAndFixSafetyRating(result);

    // Validate PawMD score label matches score
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
        food_type: result.food_type || dto.food_type || 'other',
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
   * Analyze food with images using vision model
   */
  private async analyzeWithImages(
    systemPrompt: string,
    userPrompt: string,
    images: string[], // base64 data URLs or URLs
    model: string = 'gpt-5-mini',
  ): Promise<{ content: string; tokensUsed: number }> {
    const fullPrompt = `${userPrompt}

IMPORTANT: Analyze the attached image(s) to identify the food item or ingredient label. Be specific about what you see.`;

    return this.openaiProvider.chatWithVision(
      systemPrompt,
      fullPrompt,
      images,
      [],
      {
        model,
        maxTokens: 1400,
        temperature: 0.3,
        responseFormat: 'json',
      },
    );
  }

  private readonly ESCALATION_CONFIDENCE_THRESHOLD = 70;
  private readonly GENERIC_FOOD_NAMES = [
    'unknown food',
    'unable to identify',
    'unidentified',
    'food item',
    'unknown',
  ];

  /**
   * Check if result needs escalation to gpt-4o
   */
  private needsEscalation(result: FoodScanAnalysis): boolean {
    if (result.confidence < this.ESCALATION_CONFIDENCE_THRESHOLD) {
      this.logger.debug(
        `Escalation needed: confidence ${result.confidence} < ${this.ESCALATION_CONFIDENCE_THRESHOLD}`,
      );
      return true;
    }
    if (result.safety_rating === 'unknown') {
      this.logger.debug('Escalation needed: safety_rating is unknown');
      return true;
    }
    const nameLower = (result.food_name || '').toLowerCase().trim();
    if (this.GENERIC_FOOD_NAMES.some((g) => nameLower.includes(g))) {
      this.logger.debug(`Escalation needed: generic food name "${result.food_name}"`);
      return true;
    }
    return false;
  }

  /**
   * Enforce single source of truth: toxic_ingredients and their severity drive
   * toxicity_score, PawMD score, recommendation, and safety_rating.
   * - If any toxic ingredient with severity >= 7: score 0, not recommended, risk = max severity.
   * - If any toxic or "may contain" toxic: do not recommend, low score.
   */
  private enforceToxicityConsistency(result: FoodScanAnalysis): void {
    const toxics = result.toxic_ingredients || [];
    const maxSeverity = toxics.length
      ? Math.max(...toxics.map((t) => t.severity ?? 0))
      : 0;
    const effectiveToxicity = Math.max(result.toxicity_score ?? 0, maxSeverity);
    result.toxicity_score = effectiveToxicity;

    const hasAnyToxic = toxics.length > 0 || result.safety_rating === 'toxic';
    const hasHighSeverity =
      maxSeverity >= this.SEVERITY_SCORE_ZERO || effectiveToxicity >= this.SEVERITY_SCORE_ZERO;
    const criticalWarning = (result.warnings || []).some((w) => w.level === 'critical');

    if (hasHighSeverity) {
      // 7/10 or 10/10 toxic → PawMD score 0, avoid, never give
      result.safety_rating = 'toxic';
      result.pawmd_score = result.pawmd_score ?? {
        score: 0,
        label: 'avoid',
        summary: '',
        factors: { ingredient_quality: 0, nutritional_balance: 0, beneficial_components: 0, harmful_components: 0, pet_specific: 0 },
      };
      result.pawmd_score.score = 0;
      result.pawmd_score.label = 'avoid';
      result.pawmd_score.factors = result.pawmd_score.factors ?? ({} as any);
      result.pawmd_score.factors.harmful_components = 0;
      if (result.recommended_serving) {
        result.recommended_serving.safe_to_give = false;
        result.recommended_serving.frequency = 'Never';
        result.recommended_serving.max_daily_amount = '0';
        result.recommended_serving.serving_size = 'None';
      }
      this.logger.debug(`FoodScan: enforced score 0 and not recommended (max severity ${maxSeverity})`);
      return;
    }

    if (hasAnyToxic || criticalWarning) {
      // Any toxic or may-be-toxic → do not recommend; cap varies by severity so different ingredients get different scores
      result.safety_rating = result.safety_rating === 'toxic' ? 'toxic' : 'caution';
      if (result.pawmd_score) {
        const maxAllowed = Math.max(
          0,
          this.SCORE_CAP_ANY_TOXIC - maxSeverity * this.SEVERITY_PENALTY,
        );
        const capped = Math.min(result.pawmd_score.score, maxAllowed);
        result.pawmd_score.score = capped;
        result.pawmd_score.label = getPawMDScoreLabel(capped);
        if (result.pawmd_score.factors) {
          result.pawmd_score.factors.harmful_components = Math.min(
            result.pawmd_score.factors.harmful_components ?? 100,
            maxSeverity > 0 ? Math.max(0, 100 - maxSeverity * 10) : 30,
          );
        }
      }
      if (result.recommended_serving) {
        result.recommended_serving.safe_to_give = false;
        result.recommended_serving.frequency = result.recommended_serving.frequency || 'Never';
        result.recommended_serving.max_daily_amount = result.recommended_serving.max_daily_amount || 'None';
      }
      this.logger.debug(`FoodScan: enforced not recommended (any toxic or critical), score capped`);
    }
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
    if (model === 'gpt-4o') {
      return parseFloat(((tokensUsed / 1000) * 0.01).toFixed(6));
    }
    // gpt-5-mini: lower cost than nano
    if (model === 'gpt-5-mini') {
      return parseFloat(((tokensUsed / 1000) * 0.0002).toFixed(6));
    }
    // gpt-4o-mini fallback
    return parseFloat(((tokensUsed / 1000) * 0.0004).toFixed(6));
  }

  /**
   * Build comprehensive user prompt with pet context and species-specific toxic database
   */
  private buildUserPrompt(dto: FoodScanRequestDto, pet: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const species = (pet.species || 'dog').toLowerCase();
    const toxicDb = this.getToxicDatabaseForSpecies(species);

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

${toxicDb}

TASK:
1. Identify the food item (be specific - include brand if visible)
2. Check ALL ingredients against the toxic database above
3. If ANY toxic ingredient found or "may contain" toxic (sauces, seasonings): toxicity_score = max severity, safety_rating = toxic/caution
4. Calculate PawMD Score following BINDING RULES in system prompt
5. Provide serving recommendation based on ${pet.weight || 'average'} lbs weight
6. Answer: Does this food ADD nutritional value for ${pet.name}?

Return JSON only.`;
  }

  /**
   * Get species-specific toxic foods database
   */
  private getToxicDatabaseForSpecies(species: string): string {
    if (species === 'cat') {
      return `TOXIC FOODS DATABASE FOR CATS:

Highly Toxic (severity 7-10):
- Chocolate (10): vomiting, seizures, death
- Xylitol/artificial sweeteners (10): liver failure, death
- Onions (9): anemia, organ damage
- Garlic (8): anemia, organ damage
- Grapes/Raisins (8): kidney failure
- Caffeine (9): hyperactivity, seizures
- Alcohol (10): intoxication, death
- Lilies (10): kidney failure

Moderate Risk (severity 4-6):
- Raw fish (6): thiamine deficiency
- Dairy (5): digestive upset
- Raw eggs (4): salmonella, biotin deficiency
- Bones (5): choking, obstruction
- Fat trimmings (4): pancreatitis`;
    }

    return `TOXIC FOODS DATABASE FOR DOGS:

Highly Toxic (severity 7-10):
- Chocolate (10): vomiting, diarrhea, seizures, death
- Xylitol/artificial sweeteners (10): liver failure, seizures, death
- Grapes/Raisins (9): kidney failure
- Onions (8): anemia, organ damage
- Garlic (7): anemia, organ damage
- Macadamia nuts (7): weakness, tremors
- Caffeine (9): hyperactivity, seizures, death
- Alcohol (10): intoxication, coma, death

Moderate Risk (severity 4-6):
- Avocado (6): vomiting, diarrhea
- Apple seeds (4): cyanide in large amounts
- Cherry/Peach pits (5): cyanide
- Raw yeast dough (7): bloat, alcohol poisoning
- Excessive salt (5): sodium poisoning
- Nutmeg (5): seizures, tremors`;
  }

}
