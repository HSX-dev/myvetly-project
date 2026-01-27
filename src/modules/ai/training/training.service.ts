import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { TrainingAnalyzeRequestDto, TrainingAnalyzeResponseDto } from './training.dto';
import { NotFoundException } from '../../../common/exceptions';

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

  async analyze(dto: TrainingAnalyzeRequestDto, userId: string): Promise<TrainingAnalyzeResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:training:${userId}`,
      RATE_LIMITS.TRAINING.maxRequests,
      RATE_LIMITS.TRAINING.windowSeconds,
    );

    const [petResult, prefResult] = await Promise.all([
      this.getSupabase().from('pets').select('*').eq('id', dto.pet_id).single(),
      this.getSupabase().from('pet_training_preferences').select('*').eq('id', dto.preference_id).single(),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }
    if (prefResult.error || !prefResult.data) {
      throw new NotFoundException('Training preferences', dto.preference_id);
    }

    const pet = petResult.data;
    const prefs = prefResult.data;

    const userPrompt = this.buildUserPrompt(pet, prefs);
    const response = await this.callOpenAI(AI_PROMPTS.TRAINING_SYSTEM, userPrompt, {
      temperature: 0.7,
      maxTokens: 2000,
    });

    const result = this.parseJsonResponse(response.content);

    this.logTiming('Training analyze', startTime);

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
    return `TRAINING PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs

PREFERENCES:
- Behavior Issues: ${prefs.behavior_issues?.join(', ') || 'Not specified'}
- Goals: ${prefs.training_goals?.join(', ') || 'Not specified'}
- Experience: ${prefs.experience_level || 'beginner'}
- Time: ${prefs.time_commitment_minutes || 15} min/day

Create a 4-week training plan. Return JSON:
{
  "summary": "2-3 sentences",
  "difficulty_level": "easy|medium|hard",
  "safety_notes": "string",
  "primary_behaviors": ["string"],
  "overall_metrics": ["string"],
  "weekly_plan": [
    {
      "week_number": 1,
      "focus": "string",
      "daily_sessions": [
        {"day_label": "Session 1", "exercise_name": "string", "steps": ["string"], "estimated_time_minutes": number, "tracking_metrics": ["string"]}
      ]
    }
  ]
}`;
  }
}
