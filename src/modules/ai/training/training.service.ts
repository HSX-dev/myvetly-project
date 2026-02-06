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

    // Fetch pet and preferences in parallel
    const [petResult, prefs] = await Promise.all([
      this.getSupabase().from('pets').select('*').eq('id', dto.pet_id).single(),
      this.supabaseService.getTrainingPreferences(dto.preference_id),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const pet = petResult.data;

    // Build comprehensive user prompt
    const userPrompt = this.buildUserPrompt(pet, prefs);

    // Call AI (use DeepSeek for cost efficiency, fallback to OpenAI)
    let response;
    let modelUsed = 'deepseek-chat';
    try {
      response = await this.callDeepSeek(AI_PROMPTS.TRAINING_SYSTEM, userPrompt, {
        temperature: 0.7,
        maxTokens: 2500,
      });
    } catch (error) {
      // Fallback to OpenAI if DeepSeek fails
      this.logger.warn('DeepSeek failed, falling back to OpenAI');
      response = await this.callOpenAI(AI_PROMPTS.TRAINING_SYSTEM, userPrompt, {
        temperature: 0.7,
        maxTokens: 2500,
      });
      modelUsed = 'gpt-4o-mini';
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse<TrainingPlanResult>(response.content);

    // Validate response structure
    this.validateTrainingPlan(result);

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
   * Build comprehensive user prompt with all pet data
   */
  private buildUserPrompt(pet: any, prefs: TrainingPreferences): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';

    // Get experience level description
    const experienceDesc =
      EXPERIENCE_LEVEL_MAP[prefs.experience_level] || prefs.experience_level || 'Not specified';

    // Format behavior issues
    const behaviorIssues =
      Array.isArray(prefs.behavior_issues) && prefs.behavior_issues.length > 0
        ? prefs.behavior_issues.join(', ')
        : 'Not specified';

    // Format training goals
    const trainingGoals =
      Array.isArray(prefs.training_goals) && prefs.training_goals.length > 0
        ? prefs.training_goals.join(', ')
        : 'Not specified';

    return `TRAINING PLAN REQUEST

PET PROFILE:
- Name: ${pet.name}
- Species: ${pet.species || 'Unknown'}
- Breed: ${pet.breed || 'Unknown'}
- Age: ${age}
- Sex: ${pet.gender || pet.sex || 'Unknown'}
- Weight: ${pet.weight || 'Unknown'} lbs
- Medical History: ${pet.medical_history || 'None recorded'}

OWNER PREFERENCES:
- Behavior Issues: ${behaviorIssues}
- Training Goals: ${trainingGoals}
- Experience Level: ${experienceDesc}
- Time Commitment: ${prefs.time_commitment_minutes ? `${prefs.time_commitment_minutes} minutes per day` : 'Not specified'}
- Specific Behaviors to Address: ${prefs.specific_behaviors || 'Not specified'}

TASK:

1. From the behavior issues and goals, choose 1-3 primary behaviors to focus on
   (for example: leash pulling, barking at strangers, separation anxiety).

2. Create a progressive 4-week plan. Each week should have 3-5 training sessions,
   not 7 unique days. The owner can repeat sessions on other days.

3. Adapt the difficulty to:
   - the pet's species, breed, age, and health
   - the owner's experience level (${prefs.experience_level || 'beginner'})
   - the available time (${prefs.time_commitment_minutes || 15} minutes per day)

4. Use only positive reinforcement (rewards, praise, management) and clear, safe handling.

PLAN CONTENT:

1. summary (2-3 sentences):
   - Simple overview of the approach and what the plan will help improve.

2. difficulty_level:
   - "easy", "medium", or "hard" based on behavior complexity and owner experience.

3. safety_notes:
   - Important safety points related to the behaviors and any health issues.

4. weekly_plan:
   - Include 4 items only (week_number 1-4).
   - For each week:
     - week_number: 1, 2, 3, or 4
     - focus: short sentence about what this week emphasizes
     - daily_sessions: an array of 3-5 sessions. Each session has:
       - day_label: "Session 1", "Session 2", etc. (not calendar days)
       - exercise_name: clear, specific name
       - steps: 3-7 short, ordered steps in simple language
       - estimated_time_minutes: realistic time based on the owner's time commitment
       - tracking_metrics: 1-3 simple, measurable metrics

5. primary_behaviors:
   - List of the 1-3 key behaviors this plan targets, in everyday language.

6. overall_metrics:
   - 2-4 bigger metrics the owner can track over the full 4 weeks.

Be practical, specific, and kind. Never blame the owner or the pet. Focus on small, achievable steps and clear, measurable progress.

Return JSON only.`;
  }
}
