import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { HealthhubRequestDto, HealthhubResponseDto } from './healthhub.dto';

@Injectable()
export class HealthhubService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(dto: HealthhubRequestDto, userId: string): Promise<HealthhubResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:healthhub:${userId}`,
      RATE_LIMITS.HEALTHHUB.maxRequests,
      RATE_LIMITS.HEALTHHUB.windowSeconds,
    );

    // Check cache unless force refresh
    if (!dto.force_refresh) {
      const cached = await this.redisService.get(`healthhub:${dto.pet_id}`);
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    }

    // Fetch pet data in parallel
    const [pet, records, appointments] = await Promise.all([
      this.supabaseService.getPetContext(dto.pet_id),
      this.supabaseService.getPetMedicalRecords(dto.pet_id, 10),
      this.supabaseService.getPetAppointments(dto.pet_id, 5),
    ]);

    if (!pet) {
      throw new Error('Pet not found');
    }

    const userPrompt = this.buildUserPrompt(pet, records, appointments);
    const response = await this.callOpenAI(AI_PROMPTS.HEALTHHUB_SYSTEM, userPrompt, {
      temperature: 0.5,
      maxTokens: 1000,
    });

    const result = this.parseJsonResponse(response.content);

    // Cache for 5 minutes
    const responseData = {
      pet_id: dto.pet_id,
      analysis: result,
      generated_at: new Date().toISOString(),
    };
    await this.redisService.set(`healthhub:${dto.pet_id}`, JSON.stringify(responseData), 300);

    this.logTiming('Healthhub analyze', startTime);

    return responseData;
  }

  private buildUserPrompt(pet: any, records: any[], appointments: any[]): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    return `HEALTH ANALYSIS REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Allergies: ${pet.allergies || 'None'}

RECENT MEDICAL RECORDS (${records?.length || 0}):
${records?.slice(0, 5).map(r => `- ${r.record_type}: ${r.notes || 'No notes'}`).join('\n') || 'None'}

RECENT APPOINTMENTS (${appointments?.length || 0}):
${appointments?.slice(0, 3).map(a => `- ${a.service_type}: ${a.status}`).join('\n') || 'None'}

Analyze this pet's health and provide insights. Return JSON only.`;
  }
}
