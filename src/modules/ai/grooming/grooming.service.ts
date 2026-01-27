import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { GroomingPlanRequestDto, GroomingPlanResponseDto } from './grooming.dto';

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

  async analyze(dto: GroomingPlanRequestDto, userId: string): Promise<GroomingPlanResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:grooming:${userId}`,
      RATE_LIMITS.GROOMING.maxRequests,
      RATE_LIMITS.GROOMING.windowSeconds,
    );

    const pet = await this.getPetById(dto.pet_id, 'id, name, species, breed, sex, weight, birth_date, allergies');
    const category = dto.category || 'full_plan';

    const userPrompt = this.buildUserPrompt(pet, category);
    const response = await this.callOpenAI(AI_PROMPTS.GROOMING_SYSTEM, userPrompt, {
      temperature: 0.7,
      maxTokens: 1500,
    });

    const result = this.parseJsonResponse(response.content);

    this.logTiming('Grooming analyze', startTime);

    return {
      success: true,
      data: result,
      pet: { id: pet.id, name: pet.name, breed: pet.breed, species: pet.species },
      latency_ms: Date.now() - startTime,
    };
  }

  private buildUserPrompt(pet: any, category: string): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const isFullPlan = category === 'full_plan';

    return `GROOMING PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Allergies: ${pet.allergies || 'None'}

${isFullPlan ? 'Generate a COMPLETE grooming plan for all categories.' : `Generate plan for: ${category.replace(/_/g, ' ')}`}

Return JSON:
${isFullPlan ? `{
  "category": "full_plan",
  "haircut_and_bath": {"category": "haircut_and_bath", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "nails": {"category": "nails", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "dental": {"category": "dental", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "ears": {"category": "ears", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"}
}` : `{
  "category": "${category}",
  "frequency": "string",
  "method": "string",
  "products": ["string"],
  "tips": ["string"],
  "warning_signs": ["string"],
  "breed_specific_notes": "string"
}`}`;
  }
}
