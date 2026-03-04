import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider, GeminiProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  PawScanRequestDto,
  PawScanResponseDto,
  PawScanTreatmentResponseDto,
  PawScanFollowUpRequiredDto,
  PawScanAnalyzeResponse,
} from './pawscan.dto';
import { BadRequestException, NotFoundException } from '../../../common/exceptions';
import { fetchImagesAsBase64 } from '../shared/image-utils';

@Injectable()
export class PawscanService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(
    dto: PawScanRequestDto,
    userId: string,
  ): Promise<PawScanAnalyzeResponse | PawScanTreatmentResponseDto> {
    await this.checkRateLimit(
      `rate:pawscan:${userId}`,
      RATE_LIMITS.PAWSCAN.maxRequests,
      RATE_LIMITS.PAWSCAN.windowSeconds,
    );

    // Handle treatment generation mode
    if (dto.mode === 'generate_treatment' && dto.session_id) {
      return this.generateTreatment(dto.session_id);
    }

    // Handle follow-up mode - user is submitting follow-up answers
    if (dto.mode === 'follow_up' && dto.session_id && dto.follow_up_answers) {
      return this.completeAnalysisWithFollowUp(dto.session_id, dto.follow_up_answers);
    }

    // Initial analysis mode
    return this.performInitialAnalysis(dto);
  }

  /**
   * Perform initial analysis - may return follow-up questions or complete result
   */
  private async performInitialAnalysis(dto: PawScanRequestDto): Promise<PawScanAnalyzeResponse> {
    const startTime = Date.now();
    const pet = await this.getPetById(dto.pet_id!, 'id, client_id, name, species, breed, sex, weight, birth_date');

    const userPrompt = this.buildUserPrompt(dto.answers, pet);

    // Use vision model if images provided, otherwise use fast model for initial analysis
    let response: { content: string; tokensUsed: number };
    let modelUsed: string;
    let mediaBase64: string[] | undefined;

    const fallbackOpenAI = async (): Promise<{ content: string; tokensUsed: number }> => {
      return this.callOpenAI(AI_PROMPTS.PAWSCAN_SYSTEM, userPrompt, {
        model: 'gpt-5.2',
        temperature: 0.3,
        maxTokens: 2000,
      });
    };

    if (dto.media && dto.media.length > 0) {
      mediaBase64 = await fetchImagesAsBase64(dto.media);
      const visionSuffix = '\n\nIMPORTANT: Analyze the attached image for any visible symptoms, injuries, skin conditions, or abnormalities. Include observations from the image in your diagnosis. Output the complete JSON object only; do not truncate.';
      if (this.geminiProvider.isAvailable()) {
        try {
          response = await this.geminiProvider.chatWithVision(
            AI_PROMPTS.PAWSCAN_SYSTEM,
            userPrompt + visionSuffix,
            mediaBase64,
            [],
            { maxTokens: 4096, responseFormat: 'json' },
          );
          if (response?.content?.trim()) {
            if (response.content.length < 400) {
              this.logger.warn(`PawScan: Gemini response very short (${response.content.length} chars), may be truncated`);
            }
            modelUsed = 'gemini-3-flash-preview';
          } else throw new Error('Empty content');
        } catch (err) {
          this.logger.warn(`PawScan: Gemini vision failed (${(err as Error)?.message}), falling back to gpt-5.2`);
          response = await this.analyzeWithImages(AI_PROMPTS.PAWSCAN_SYSTEM, userPrompt, mediaBase64);
          modelUsed = 'gpt-5.2';
        }
      } else {
        response = await this.analyzeWithImages(AI_PROMPTS.PAWSCAN_SYSTEM, userPrompt, mediaBase64);
        modelUsed = 'gpt-5.2';
      }
    } else {
      if (this.geminiProvider.isAvailable()) {
        try {
          response = await this.geminiProvider.chat(
            [
              { role: 'system', content: AI_PROMPTS.PAWSCAN_SYSTEM },
              { role: 'user', content: userPrompt },
            ],
            { maxTokens: 4096, responseFormat: 'json' },
          );
          if (response?.content?.trim()) modelUsed = 'gemini-3-flash-preview';
          else throw new Error('Empty content');
        } catch (err) {
          this.logger.warn(`PawScan: Gemini text failed (${(err as Error)?.message}), falling back to gpt-5.2`);
          response = await fallbackOpenAI();
          modelUsed = 'gpt-5.2';
        }
      } else {
        response = await fallbackOpenAI();
        modelUsed = 'gpt-5.2';
      }
    }

    let result: any;
    try {
      result = this.parseJsonResponse(response.content);
    } catch (parseErr) {
      if (
        parseErr instanceof BadRequestException &&
        parseErr.message === 'Failed to parse AI response' &&
        modelUsed === 'gemini-3-flash-preview'
      ) {
        this.logger.warn('PawScan: Gemini response failed to parse (truncated/malformed), retrying with gpt-5.2');
        if (mediaBase64?.length) {
          response = await this.analyzeWithImages(AI_PROMPTS.PAWSCAN_SYSTEM, userPrompt, mediaBase64);
        } else {
          response = await fallbackOpenAI();
        }
        modelUsed = 'gpt-5.2';
        result = this.parseJsonResponse(response.content);
      } else {
        throw parseErr;
      }
    }

    // Check if AI needs follow-up questions
    if (result.needs_followup === true && result.follow_up_questions?.length > 0) {
      return this.createFollowUpSession(result, pet, dto, modelUsed, startTime);
    }

    // AI has sufficient info - return complete analysis
    this.ensureSeverityFields(result);
    return this.saveAndReturnCompleteResult(result, pet, dto, modelUsed, startTime);
  }

  /**
   * Create a pending session with follow-up questions
   */
  private async createFollowUpSession(
    result: any,
    pet: any,
    dto: PawScanRequestDto,
    modelUsed: string,
    startTime: number,
  ): Promise<PawScanFollowUpRequiredDto> {
    // Store partial session with pending status
    const { data: session, error: insertError } = await this.getSupabase()
      .from('pawscan_sessions')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        model_used: modelUsed,
        prompt: dto.answers,
        ai_response: { preliminary: result.preliminary_assessment },
        status: 'in_progress',
        analysis_phase: 'pending_followup',
        follow_up_questions: result.follow_up_questions,
        latency_ms: Date.now() - startTime,
      })
      .select('id')
      .single();

    if (insertError) {
      this.logger.warn(`PawScan session insert failed: ${insertError.message}`);
    }

    this.logTiming('PawScan initial (follow-up required)', startTime);

    return {
      session_id: session?.id ?? '',
      phase: 'follow_up_required',
      preliminary_assessment: result.preliminary_assessment || 'I need a bit more information to provide an accurate assessment.',
      follow_up_questions: result.follow_up_questions,
      confidence_score: result.confidence_score || 0.5,
      model_used: modelUsed,
      latency_ms: Date.now() - startTime,
    };
  }

  /**
   * Complete analysis after receiving follow-up answers
   */
  private async completeAnalysisWithFollowUp(
    sessionId: string,
    followUpAnswers: Record<string, string>,
  ): Promise<PawScanResponseDto> {
    const startTime = Date.now();

    // Fetch the pending session
    const { data: session, error } = await this.getSupabase()
      .from('pawscan_sessions')
      .select('*, pets(id, client_id, name, species, breed, sex, weight, birth_date)')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new NotFoundException('PawScan session', sessionId);
    }

    if (session.analysis_phase !== 'pending_followup') {
      throw new Error('Session is not pending follow-up');
    }

    const pet = session.pets;
    const originalAnswers = session.prompt;
    const followUpQuestions = session.follow_up_questions || [];

    // Build comprehensive prompt with all information
    const finalPrompt = this.buildFinalPrompt(originalAnswers, pet, followUpQuestions, followUpAnswers);

    const response = await this.callOpenAI(AI_PROMPTS.PAWSCAN_FINAL, finalPrompt, {
      model: 'gpt-5.2',
      temperature: 0.3,
      maxTokens: 1200,
    });

    const result = this.parseJsonResponse(response.content);
    this.ensureSeverityFields(result);

    // Update session with complete analysis
    const { error: updateError } = await this.getSupabase()
      .from('pawscan_sessions')
      .update({
        ai_response: result,
        severity: result.severity_label,
        severity_score: result.severity_score,
        severity_label: result.severity_label,
        vet_action: result.vet_action,
        diagnosis: result.diagnosis,
        prognosis: result.prognosis,
        recommendations: result.recommendations || [],
        status: 'completed',
        analysis_phase: 'completed',
        follow_up_answers: followUpAnswers,
        latency_ms: (session.latency_ms || 0) + (Date.now() - startTime),
        risk_flags: result.risk_flags || [],
        model_used: 'gpt-5.2',
      })
      .eq('id', sessionId);

    if (updateError) {
      this.logger.warn(`PawScan session update failed: ${updateError.message}`);
    }

    this.logTiming('PawScan final analysis', startTime);

    return {
      session_id: sessionId,
      phase: 'completed',
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
      model_used: 'gpt-5.2',
      latency_ms: Date.now() - startTime,
      cost_usd: 0,
    };
  }

  /**
   * Save and return complete analysis result (when no follow-up needed)
   */
  private async saveAndReturnCompleteResult(
    result: any,
    pet: any,
    dto: PawScanRequestDto,
    modelUsed: string,
    startTime: number,
  ): Promise<PawScanResponseDto> {
    // Store session
    const { data: session, error: insertError } = await this.getSupabase()
      .from('pawscan_sessions')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        model_used: modelUsed,
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
        analysis_phase: 'completed',
        latency_ms: Date.now() - startTime,
        risk_flags: result.risk_flags || [],
      })
      .select('id')
      .single();

    if (insertError) {
      this.logger.warn(
        `PawScan session insert failed (returning response without session_id): ${insertError.message}. Code: ${insertError.code}. Details: ${JSON.stringify(insertError.details)}`,
      );
    }

    this.logTiming('PawScan analyze (direct)', startTime);

    return {
      session_id: session?.id ?? undefined,
      phase: 'completed',
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
      model_used: modelUsed,
      latency_ms: Date.now() - startTime,
      cost_usd: 0,
    };
  }

  /**
   * Build prompt for final analysis with follow-up answers
   */
  private buildFinalPrompt(
    originalAnswers: any,
    pet: any,
    followUpQuestions: any[],
    followUpAnswers: Record<string, string>,
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';

    // Format follow-up Q&A
    const qaSection = followUpQuestions
      .map((q: any) => `Q: ${q.question}\nA: ${followUpAnswers[q.id] || 'Not answered'}`)
      .join('\n\n');

    return `COMPLETE SYMPTOM ANALYSIS

PET PROFILE:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed}
- Sex: ${pet.sex || 'Unknown'}
- Weight: ${pet.weight}kg
- Age: ${age}

INITIAL SYMPTOMS REPORTED:
- Category: ${originalAnswers?.category || 'General'}
- Complaint: ${originalAnswers?.complaint || originalAnswers?.symptoms || 'Not specified'}
- Started: ${originalAnswers?.when_started || originalAnswers?.duration || 'Unknown'}
- Getting Worse: ${originalAnswers?.getting_worse ? 'Yes' : 'No'}

VITAL SIGNS & BEHAVIOR:
- Appetite: ${originalAnswers?.appetite || 'Unknown'}
- Water Intake: ${originalAnswers?.water_intake || 'Unknown'}
- Energy Level: ${originalAnswers?.energy_level || 'Unknown'}
- Digestive Issues: ${originalAnswers?.digestive_issues || 'None'}

ADDITIONAL INFO:
- Current Medications: ${originalAnswers?.medications || 'None'}
- Other Symptoms: ${originalAnswers?.other_symptoms?.join(', ') || 'None'}

FOLLOW-UP INFORMATION:
${qaSection}

Based on ALL the information above, provide a complete analysis. Return JSON only.`;
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

REQUIREMENTS:
1. MEDICATIONS - You MUST recommend relevant medications. Include:
   - OTC options that pet owners can buy without a vet visit (if any exist)
   - Prescription medications the vet would likely prescribe (note "Requires vet prescription")
   - Be specific with product names, not generic categories
   - Include safe dosing info when applicable

2. NATURAL REMEDIES - Supportive home care options (warm/cold compresses, rest, etc.)

3. DIETARY RECOMMENDATIONS - Food/water adjustments that help

4. PREVENTIVE MEASURES - How to prevent recurrence

5. LIFESTYLE MODIFICATIONS - Activity/environment changes

Return JSON (medications MUST have at least 1-2 items unless literally nothing exists for this condition):
{
  "treatment_guide": {
    "medications": [{"name": "Specific Product Name", "description": "What it does, dosing, OTC or prescription"}],
    "natural_remedies": [{"remedy": "string", "description": "string"}],
    "dietary_recommendations": ["string"],
    "preventive_measures": ["string"],
    "lifestyle_modifications": ["string"]
  }
}`;

    const response = await this.callOpenAI(AI_PROMPTS.PAWSCAN_TREATMENT_SYSTEM, prompt, {
      model: 'gpt-5.2',
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
      model_used: 'gpt-5.2',
    };
  }

  /**
   * Analyze symptoms with image support using OpenAI Vision
   */
  private async analyzeWithImages(
    systemPrompt: string,
    userPrompt: string,
    mediaUrls: string[],
  ): Promise<{ content: string; tokensUsed: number }> {
    // Use first image for analysis (can extend to multiple later)
    const imageUrl = mediaUrls[0];

    const fullPrompt = `${systemPrompt}

${userPrompt}

IMPORTANT: Analyze the attached image for any visible symptoms, injuries, skin conditions, or abnormalities that may help with the assessment. Include observations from the image in your diagnosis.`;

    return this.openaiProvider.analyzeImage(imageUrl, fullPrompt, {
      model: 'gpt-5.2',
      maxTokens: 1200,
    });
  }

  private buildUserPrompt(answers: any, pet: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';

    return `SYMPTOM ANALYSIS

PET PROFILE:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed}
- Sex: ${pet.sex || 'Unknown'}
- Weight: ${pet.weight}kg
- Age: ${age}

SYMPTOMS REPORTED:
- Category: ${answers?.category || 'General'}
- Complaint: ${answers?.complaint || answers?.symptoms || 'Not specified'}
- Started: ${answers?.when_started || answers?.duration || 'Unknown'}
- Getting Worse: ${answers?.getting_worse ? 'Yes' : 'No'}

VITAL SIGNS & BEHAVIOR:
- Appetite: ${answers?.appetite || 'Unknown'}
- Water Intake: ${answers?.water_intake || 'Unknown'}
- Energy Level: ${answers?.energy_level || 'Unknown'}
- Digestive Issues: ${answers?.digestive_issues || 'None'}

ADDITIONAL INFO:
- Current Medications: ${answers?.medications || 'None'}
- Other Symptoms: ${answers?.other_symptoms?.join(', ') || 'None'}

Analyze symptoms and return JSON only.`;
  }

  /**
   * Enforce severity fields based on score thresholds.
   * Always overrides to ensure score-action alignment.
   * 
   * Thresholds:
   * - < 3.0: monitor (low/medium)
   * - 3.0-4.19: see_vet (high)
   * - >= 4.2: urgent_care (critical)
   */
  private ensureSeverityFields(result: any): void {
    const score = result.severity_score;
    if (typeof score === 'number') {
      // Always enforce vet_action based on score (overrides AI response if misaligned)
      if (score >= 4.2) result.vet_action = 'urgent_care';
      else if (score >= 3.0) result.vet_action = 'see_vet';
      else result.vet_action = 'monitor';

      // Enforce severity_label
      if (score >= 4.2) result.severity_label = 'critical';
      else if (score >= 3.0) result.severity_label = 'high';
      else if (score >= 2.0) result.severity_label = 'medium';
      else result.severity_label = 'low';
    }
  }
}
