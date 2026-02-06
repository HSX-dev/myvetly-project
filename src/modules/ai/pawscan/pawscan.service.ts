import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { PawScanRequestDto, PawScanResponseDto, PawScanTreatmentResponseDto } from './pawscan.dto';
import { NotFoundException } from '../../../common/exceptions';

@Injectable()
export class PawscanService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(dto: PawScanRequestDto, userId: string): Promise<PawScanResponseDto | PawScanTreatmentResponseDto> {
    console.log('🩺 [VETLY-API] PawScan called!', {
      userId,
      petId: dto.pet_id,
      mode: dto.mode || 'analyze',
      hasMedia: dto.media && dto.media.length > 0,
    });

    await this.checkRateLimit(
      `rate:pawscan:${userId}`,
      RATE_LIMITS.PAWSCAN.maxRequests,
      RATE_LIMITS.PAWSCAN.windowSeconds,
    );

    // Handle treatment generation mode
    if (dto.mode === 'generate_treatment' && dto.session_id) {
      return this.generateTreatment(dto.session_id);
    }

    const startTime = Date.now();
    const pet = await this.getPetById(dto.pet_id!, 'id, client_id, name, species, breed, sex, weight, birth_date');

    const userPrompt = this.buildUserPrompt(dto.answers, pet);
    const response = await this.callOpenAI(AI_PROMPTS.PAWSCAN_SYSTEM, userPrompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    const result = this.parseJsonResponse(response.content);
    this.ensureSeverityFields(result);

    // Store session
    const { data: session } = await this.getSupabase()
      .from('pawscan_sessions')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        model_used: 'gpt-4o-mini',
        prompt: dto.answers,
        ai_response: result,
        severity: result.severity_label,
        severity_score: result.severity_score,
        severity_label: result.severity_label,
        vet_action: result.vet_action,
        diagnosis: result.diagnosis,
        prognosis: result.prognosis,
        recommendations: result.recommendations || [],
        status: 'completed',
        latency_ms: Date.now() - startTime,
        risk_flags: result.risk_flags || [],
      })
      .select('id')
      .single();

    this.logTiming('PawScan analyze', startTime);

    return {
      session_id: session?.id,
      severity_score: result.severity_score,
      severity_label: result.severity_label,
      vet_action: result.vet_action,
      triage: result.triage,
      diagnosis: result.diagnosis,
      prognosis: result.prognosis,
      recommendations: result.recommendations,
      treatment_guide: null,
      risk_flags: result.risk_flags,
      confidence_score: result.confidence_score,
      model_used: 'gpt-4o-mini',
      latency_ms: Date.now() - startTime,
      cost_usd: 0,
    };
  }

  private async generateTreatment(sessionId: string): Promise<PawScanTreatmentResponseDto> {
    const { data: session, error } = await this.getSupabase()
      .from('pawscan_sessions')
      .select('*, pets(name, species, breed)')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new NotFoundException('PawScan session', sessionId);
    }

    if (session.treatment_guide) {
      return { treatment_guide: session.treatment_guide, cached: true };
    }

    const startTime = Date.now();
    const prompt = `TREATMENT GUIDE REQUEST

PET: ${session.pets?.name} (${session.pets?.species}, ${session.pets?.breed})

ASSESSMENT:
- Severity: ${session.severity_label} (${session.severity_score}/5.0)
- Action: ${session.vet_action}
- Diagnosis: ${session.diagnosis}

Generate practical home care guidance. Return JSON:
{
  "treatment_guide": {
    "medications": [{"name": "string", "description": "string"}],
    "natural_remedies": [{"remedy": "string", "description": "string"}],
    "dietary_recommendations": ["string"],
    "preventive_measures": ["string"],
    "lifestyle_modifications": ["string"]
  }
}`;

    const response = await this.callOpenAI(AI_PROMPTS.PAWSCAN_TREATMENT_SYSTEM, prompt, {
      temperature: 0.5,
      maxTokens: 800,
    });

    const result = this.parseJsonResponse(response.content);
    const treatmentGuide = result.treatment_guide || {};

    await this.getSupabase()
      .from('pawscan_sessions')
      .update({
        treatment_guide: treatmentGuide,
        treatment_guide_generated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return {
      treatment_guide: treatmentGuide,
      latency_ms: Date.now() - startTime,
      model_used: 'gpt-4o-mini',
    };
  }

  private buildUserPrompt(answers: any, pet: any): string {
    return `SYMPTOM ANALYSIS

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.sex}, ${pet.weight}kg)

COMPLAINT: ${answers?.complaint || answers?.symptoms || 'Not specified'}
STARTED: ${answers?.when_started || answers?.duration || 'Unknown'}
APPETITE: ${answers?.appetite || 'Unknown'}
ENERGY: ${answers?.energy_level || 'Unknown'}
WORSENING: ${answers?.getting_worse ? 'Yes' : 'No'}
OTHER: ${answers?.other_symptoms?.join(', ') || 'None'}

Analyze and return JSON only.`;
  }

  private ensureSeverityFields(result: any): void {
    const score = result.severity_score;
    if (!result.vet_action && typeof score === 'number') {
      if (score >= 4.1) result.vet_action = 'urgent_care';
      else if (score >= 3.1) result.vet_action = 'see_vet';
      else result.vet_action = 'monitor';
    }
    if (!result.severity_label && typeof score === 'number') {
      if (score >= 4.1) result.severity_label = 'critical';
      else if (score >= 3.1) result.severity_label = 'high';
      else if (score >= 2.1) result.severity_label = 'medium';
      else result.severity_label = 'low';
    }
  }
}
