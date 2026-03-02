import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  GroomingPlanRequestDto,
  GroomingPlanResponseDto,
  GroomingCategory,
  GroomingCategoryPlan,
  FullGroomingPlan,
  CATEGORY_LABELS,
} from './grooming.dto';
import { BadRequestException } from '../../../common/exceptions';

@Injectable()
export class GroomingService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(
    dto: GroomingPlanRequestDto,
    userId: string,
  ): Promise<GroomingPlanResponseDto> {
    const startTime = Date.now();
    const category: GroomingCategory = dto.category || 'full_plan';

    await this.checkRateLimit(
      `rate:grooming:${userId}`,
      RATE_LIMITS.GROOMING.maxRequests,
      RATE_LIMITS.GROOMING.windowSeconds,
    );

    // Fetch all required data in parallel
    const [pet, groomingLogs, allergies, skinIssues] = await Promise.all([
      this.getPetById(
        dto.pet_id,
        'id, name, species, breed, sex, weight, birth_date, allergies, medical_history',
      ),
      this.supabaseService.getGroomingLogs(dto.pet_id, 10),
      this.supabaseService.getPetAllergiesFromTable(dto.pet_id),
      this.supabaseService.getSkinIssuesFromPawScan(dto.pet_id),
    ]);

    // Combine allergies from pet record and allergies table
    const allAllergies = [
      ...(pet.allergies ? [pet.allergies] : []),
      ...allergies,
    ].filter((a, i, arr) => arr.indexOf(a) === i); // dedupe

    // Calculate frequency hint from grooming logs
    const frequencyHint = this.calculateFrequencyHint(groomingLogs, category);

    // Build comprehensive user prompt
    const userPrompt = this.buildUserPrompt(
      pet,
      category,
      groomingLogs,
      allAllergies,
      skinIssues,
      frequencyHint,
    );

    // Call AI (use DeepSeek for cost efficiency, fallback to OpenAI)
    let response;
    let modelUsed = 'deepseek-chat';
    try {
      response = await this.callDeepSeek(AI_PROMPTS.GROOMING_SYSTEM, userPrompt, {
        temperature: 0.7,
        maxTokens: 1500,
      });
    } catch (error) {
      // Fallback to OpenAI if DeepSeek fails
      this.logger.warn('DeepSeek failed, falling back to OpenAI');
      response = await this.callOpenAI(AI_PROMPTS.GROOMING_SYSTEM, userPrompt, {
        model: 'gpt-5-mini',
        temperature: 0.7,
        maxTokens: 1500,
      });
      modelUsed = 'gpt-5-mini';
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<GroomingCategoryPlan | FullGroomingPlan>(
      response.content,
    );

    // Validate response structure
    this.validateGroomingPlan(result, category);

    // Calculate cost
    const cost = this.calculateCost(response.tokensUsed, modelUsed);

    // Store grooming plan in database
    await this.supabaseService.storeGroomingPlan(dto.pet_id, category, result, {
      model: modelUsed,
      latency_ms: latency,
      cost_usd: cost,
    });

    this.logTiming('Grooming analyze', startTime);

    return {
      success: true,
      data: result,
      pet: { id: pet.id, name: pet.name, breed: pet.breed, species: pet.species },
      latency_ms: latency,
      cost_usd: cost,
      model: modelUsed,
      has_allergies: allAllergies.length > 0,
      has_skin_issues: skinIssues.length > 0,
    };
  }

  /**
   * Calculate frequency hint from grooming logs
   */
  private calculateFrequencyHint(
    logs: any[],
    category: GroomingCategory,
  ): string | null {
    const categoryLogs = logs.filter((log) => log.category === category);

    if (categoryLogs.length >= 2) {
      const date1 = new Date(categoryLogs[0].logged_at);
      const date2 = new Date(categoryLogs[1].logged_at);
      const daysBetween = Math.floor(
        (date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysBetween > 0) {
        return `Current routine: approximately every ${daysBetween} days`;
      }
    }

    return null;
  }

  /**
   * Validate grooming plan structure
   */
  private validateGroomingPlan(
    plan: GroomingCategoryPlan | FullGroomingPlan,
    category: GroomingCategory,
  ): void {
    if (category === 'full_plan') {
      const fullPlan = plan as FullGroomingPlan;
      if (
        !fullPlan.haircut_and_bath ||
        !fullPlan.nails ||
        !fullPlan.dental ||
        !fullPlan.ears
      ) {
        throw new BadRequestException(
          'Invalid grooming plan: full_plan missing required categories',
        );
      }
    } else {
      const categoryPlan = plan as GroomingCategoryPlan;
      if (
        !categoryPlan.category ||
        !categoryPlan.frequency ||
        !categoryPlan.products ||
        !Array.isArray(categoryPlan.products)
      ) {
        throw new BadRequestException(
          'Invalid grooming plan: missing required fields',
        );
      }
    }
  }

  /**
   * Calculate cost based on tokens used
   */
  private calculateCost(tokensUsed: number, model: string): number {
    if (model === 'deepseek-chat') {
      return parseFloat(((tokensUsed / 1000) * 0.0002).toFixed(6));
    }
    return parseFloat(((tokensUsed / 1000) * 0.0004).toFixed(6));
  }

  /**
   * Build comprehensive user prompt with all pet data
   */
  private buildUserPrompt(
    pet: any,
    category: GroomingCategory,
    groomingLogs: any[],
    allergies: string[],
    skinIssues: string[],
    frequencyHint: string | null,
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const isFullPlan = category === 'full_plan';
    const categoryLabel = CATEGORY_LABELS[category];

    // Build compact pet profile
    const petProfile = [
      `Pet: ${pet.name || 'Unknown'}`,
      `Species: ${pet.species || 'Unknown'}`,
      pet.breed ? `Breed: ${pet.breed}` : null,
      `Age: ${age}`,
      pet.weight ? `Weight: ${pet.weight} lbs` : null,
      pet.medical_history ? `Medical History: ${pet.medical_history}` : null,
      allergies.length > 0 ? `Allergies: ${allergies.join(', ')}` : null,
      skinIssues.length > 0 ? `Skin Issues: ${skinIssues.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    // Get last grooming date for this category
    const categoryLogs = groomingLogs.filter((log) => log.category === category);
    const lastGrooming =
      categoryLogs.length > 0
        ? `Last ${categoryLabel}: ${new Date(categoryLogs[0].logged_at).toLocaleDateString()}`
        : `No ${categoryLabel.toLowerCase()} history`;

    // Build category-specific instructions
    let categoryInstructions = '';
    const hasSensitivities = allergies.length > 0 || skinIssues.length > 0;

    if (isFullPlan) {
      categoryInstructions = `Create a COMPLETE grooming plan covering all categories (haircut_and_bath, nails, dental, ears).
Consider how the categories work together for this pet's overall grooming routine.`;
    } else {
      const categoryPrompts: Record<string, string> = {
        nails: `Create a nail trimming plan. ${frequencyHint || ''} Consider breed and activity level.`,
        haircut_and_bath: `Create a haircut and bath plan. ${frequencyHint || ''} Consider coat type, breed, and activity level.${hasSensitivities ? ' IMPORTANT: Recommend only hypoallergenic/gentle products due to sensitivities.' : ''}`,
        dental: `Create a dental care plan. ${frequencyHint || ''} Daily brushing is ideal but be realistic. NEVER recommend human toothpaste.`,
        ears: `Create an ear cleaning plan. ${frequencyHint || ''} Consider ear type (floppy vs upright). NEVER recommend Q-tips in the ear canal.`,
      };
      categoryInstructions = categoryPrompts[category] || categoryPrompts['nails'];
    }

    // Sensitivity warning
    const sensitivityWarning =
      hasSensitivities
        ? `\n\nIMPORTANT: This pet has ${allergies.length > 0 ? 'allergies' : ''}${allergies.length > 0 && skinIssues.length > 0 ? ' and ' : ''}${skinIssues.length > 0 ? 'skin issues' : ''}. Recommend only gentle, hypoallergenic products.`
        : '';

    return `GROOMING PLAN REQUEST

Pet Profile: ${petProfile}
${lastGrooming}

${categoryInstructions}${sensitivityWarning}

Return JSON only.`;
  }
}
