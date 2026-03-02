import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  TrainingAnalyzeRequestDto,
  TrainingAnalyzeResponseDto,
  TrainingPlanResult,
  TrainingPreferences,
  EXPERIENCE_LEVEL_MAP,
} from './training.dto';
import { NotFoundException, BadRequestException } from '../../../common/exceptions';

@Injectable()
export class TrainingService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(
    dto: TrainingAnalyzeRequestDto,
    userId: string,
  ): Promise<TrainingAnalyzeResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:training:${userId}`,
      RATE_LIMITS.TRAINING.maxRequests,
      RATE_LIMITS.TRAINING.windowSeconds,
    );

    const phaseNumber = dto.phase_number || 1;
    const weekOffset = (phaseNumber - 1) * 3;

    // Fetch pet, preferences, and previous plan (if continuation) in parallel
    const [petResult, prefs, previousPlan] = await Promise.all([
      this.getSupabase().from('pets').select('*').eq('id', dto.pet_id).single(),
      this.supabaseService.getTrainingPreferences(dto.preference_id),
      dto.previous_plan_id
        ? this.getSupabase()
            .from('pet_training_plans')
            .select('plan_data')
            .eq('id', dto.previous_plan_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const pet = petResult.data;

    // Build user prompt (continuation or new)
    const userPrompt = previousPlan.data
      ? this.buildContinuationPrompt(pet, prefs, previousPlan.data.plan_data, phaseNumber)
      : this.buildUserPrompt(pet, prefs);

    // Call AI (use DeepSeek for cost efficiency, fallback to OpenAI)
    let response;
    let modelUsed = 'deepseek-chat';
    try {
      response = await this.callDeepSeek(AI_PROMPTS.TRAINING_SYSTEM, userPrompt, {
        temperature: 0.7,
        maxTokens: 1800,
      });
    } catch (error) {
      // Fallback to OpenAI if DeepSeek fails
      this.logger.warn('DeepSeek failed, falling back to OpenAI');
      response = await this.callOpenAI(AI_PROMPTS.TRAINING_SYSTEM, userPrompt, {
        model: 'gpt-5-mini',
        temperature: 0.7,
        maxTokens: 1800,
      });
      modelUsed = 'gpt-5-mini';
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<TrainingPlanResult>(response.content);

    // Validate response structure
    this.validateTrainingPlan(result);

    // Add phase metadata
    result.phase_number = phaseNumber;
    result.previous_plan_id = dto.previous_plan_id;
    result.week_offset = weekOffset;

    // Calculate cost
    const cost = this.calculateCost(response.tokensUsed, modelUsed);

    // Store training plan in database
    await this.supabaseService.storeTrainingPlan(dto.pet_id, dto.preference_id, result, {
      model: modelUsed,
      latency_ms: latency,
      cost_usd: cost,
    });

    this.logTiming('Training analyze', startTime);

    return {
      success: true,
      data: result,
      latency_ms: latency,
      cost_usd: cost,
      model: modelUsed,
    };
  }

  /**
   * Validate training plan structure
   */
  private validateTrainingPlan(plan: TrainingPlanResult): void {
    if (!plan.summary || typeof plan.summary !== 'string') {
      throw new BadRequestException('Invalid training plan: missing summary');
    }

    if (!['easy', 'medium', 'hard'].includes(plan.difficulty_level)) {
      throw new BadRequestException('Invalid training plan: invalid difficulty_level');
    }

    if (!plan.weekly_plan || !Array.isArray(plan.weekly_plan)) {
      throw new BadRequestException('Invalid training plan: missing weekly_plan');
    }

    if (plan.weekly_plan.length === 0) {
      throw new BadRequestException('Invalid training plan: empty weekly_plan');
    }

    // Validate each week has required fields
    for (const week of plan.weekly_plan) {
      if (!week.week_number || !week.focus || !week.daily_sessions) {
        throw new BadRequestException('Invalid training plan: week missing required fields');
      }
    }
  }

  /**
   * Calculate cost based on tokens used
   */
  private calculateCost(tokensUsed: number, model: string): number {
    // DeepSeek pricing: ~$0.14 per 1M input tokens, ~$0.28 per 1M output tokens
    if (model === 'deepseek-chat') {
      return parseFloat(((tokensUsed / 1000) * 0.0002).toFixed(6));
    }
    // GPT-4o-mini pricing
    return parseFloat(((tokensUsed / 1000) * 0.0004).toFixed(6));
  }

  /**
   * Build user prompt for initial 3-week plan
   */
  private buildUserPrompt(pet: any, prefs: TrainingPreferences): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const experienceDesc =
      EXPERIENCE_LEVEL_MAP[prefs.experience_level] || prefs.experience_level || 'Not specified';
    const behaviorIssues =
      Array.isArray(prefs.behavior_issues) && prefs.behavior_issues.length > 0
        ? prefs.behavior_issues.join(', ')
        : 'Not specified';
    const trainingGoals =
      Array.isArray(prefs.training_goals) && prefs.training_goals.length > 0
        ? prefs.training_goals.join(', ')
        : 'Not specified';

    return `PET: ${pet.name}, ${pet.species || 'Unknown'} (${pet.breed || 'Unknown'}), Age: ${age}, Weight: ${pet.weight || 'Unknown'} lbs

GOALS: ${trainingGoals}
ISSUES: ${behaviorIssues}
EXPERIENCE: ${experienceDesc}
TIME: ${prefs.time_commitment_minutes || 15} min/day
${prefs.specific_behaviors ? `SPECIFIC: ${prefs.specific_behaviors}` : ''}

Create a 3-week training plan (Phase 1, Weeks 1-3):
- 3-4 sessions per week
- Focus on 1-3 primary behaviors
- Adapt to ${prefs.experience_level || 'beginner'} level
- Use positive reinforcement only

Return JSON with: summary, difficulty_level, safety_notes, primary_behaviors, overall_metrics, weekly_plan (3 weeks, week_number 1-3).`;
  }

  /**
   * Build continuation prompt for next phase
   */
  private buildContinuationPrompt(
    pet: any,
    prefs: TrainingPreferences,
    previousPlan: TrainingPlanResult,
    phaseNumber: number,
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const startWeek = (phaseNumber - 1) * 3 + 1;
    const endWeek = phaseNumber * 3;

    const previousSummary = previousPlan.weekly_plan
      .map((w) => `Week ${w.week_number}: ${w.focus}`)
      .join('; ');

    return `PET: ${pet.name}, ${pet.species || 'Unknown'} (${pet.breed || 'Unknown'}), Age: ${age}

CONTINUATION - Phase ${phaseNumber} (Weeks ${startWeek}-${endWeek})

PREVIOUS PHASE COVERED:
${previousSummary}

Primary behaviors worked on: ${previousPlan.primary_behaviors.join(', ')}

Create the NEXT 3-week phase that builds on previous progress:
- Weeks ${startWeek}-${endWeek} (use week_number ${startWeek}, ${startWeek + 1}, ${startWeek + 2})
- 3-4 sessions per week
- Progress difficulty appropriately
- Build on skills from previous phase
- Continue positive reinforcement

Return JSON with: summary, difficulty_level, safety_notes, primary_behaviors, overall_metrics, weekly_plan (3 weeks).`;
  }
}
