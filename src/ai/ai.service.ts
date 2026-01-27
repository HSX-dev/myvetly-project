import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../cache/redis.service';
import { DeepseekProvider } from './providers/deepseek.provider';
import { OpenaiProvider } from './providers/openai.provider';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { HealthhubRequestDto, HealthhubResponseDto } from './dto/healthhub.dto';
import { SoapExpandRequestDto, SoapExpandResponseDto } from './dto/soap.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  NotFoundException,
  RateLimitException,
  ExternalServiceException,
  BadRequestException,
} from '../common/exceptions';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private supabaseService: SupabaseService,
    private redisService: RedisService,
    private deepseekProvider: DeepseekProvider,
    private openaiProvider: OpenaiProvider,
  ) {}

  // ============================================
  // CHAT (Pawla) - Migrated from pawla-chat Edge Function
  // ============================================
  async chat(dto: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    const startTime = Date.now();
    const sessionId = dto.session_id || uuidv4();

    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:chat:${userId}`,
      50, // 50 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    // Get pet context if pet_id provided (parallel fetch for speed)
    let petContext = '';
    if (dto.pet_id) {
      // Check cache first
      const cached = await this.redisService.getCachedPetContext(dto.pet_id);
      if (cached) {
        petContext = JSON.stringify(cached);
      } else {
        // Parallel fetch - 3x faster than sequential
        const [pet, records, appointments] = await Promise.all([
          this.supabaseService.getPetContext(dto.pet_id),
          this.supabaseService.getPetMedicalRecords(dto.pet_id, 3), // Reduced from 5 to 3
          this.supabaseService.getPetAppointments(dto.pet_id, 2),   // Reduced from 3 to 2
        ]);
        
        const context = { pet, records, appointments };
        this.redisService.cachePetContext(dto.pet_id, context, 300); // Don't await cache write
        petContext = JSON.stringify(context);
      }
    }

    // Build system prompt
    const systemPrompt = this.buildChatSystemPrompt(petContext);

    // Handle image analysis if images provided
    if (dto.images && dto.images.length > 0) {
      const imageAnalysis = await this.openaiProvider.analyzeImage(
        dto.images[0],
        `Analyze this pet image and describe what you see. Focus on any health-related observations.`,
      );
      dto.message = `[Image Analysis: ${imageAnalysis.content}]\n\nUser question: ${dto.message}`;
    }

    // Call OpenAI GPT-4o-mini for chat (faster than DeepSeek)
    const aiStartTime = Date.now();
    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dto.message },
      ],
      { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 500 },
    );
    
    const totalTime = Date.now() - startTime;
    const aiTime = Date.now() - aiStartTime;
    this.logger.log(`Chat completed: total=${totalTime}ms, ai=${aiTime}ms (OpenAI)`);

    return {
      response: response.content,
      session_id: sessionId,
      tokens_used: response.tokensUsed,
    };
  }

  private buildChatSystemPrompt(petContext: string): string {
    // Shortened prompt for faster response
    const basePrompt = `You are Pawla, a friendly AI vet assistant. Be helpful, empathetic, and recommend seeing a vet for serious concerns. Keep responses concise.`;
    
    if (petContext) {
      // Truncate context to reduce tokens
      const truncatedContext = petContext.length > 500 ? petContext.substring(0, 500) + '...' : petContext;
      return `${basePrompt}\n\nPet info: ${truncatedContext}`;
    }
    return basePrompt;
  }

  // ============================================
  // HEALTHHUB - Migrated from healthhub-analyze Edge Function
  // ============================================
  async analyzeHealth(dto: HealthhubRequestDto, userId: string): Promise<HealthhubResponseDto> {
    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:healthhub:${userId}`,
      10, // 10 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    // Check cache (unless force refresh)
    if (!dto.force_refresh) {
      const cached = await this.redisService.get(`healthhub:${dto.pet_id}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Fetch pet data
    const pet = await this.supabaseService.getPetContext(dto.pet_id);
    const vaccinations = await this.supabaseService.getPetVaccinations(dto.pet_id);
    const medications = await this.supabaseService.getPetMedications(dto.pet_id);
    const records = await this.supabaseService.getPetMedicalRecords(dto.pet_id, 10);

    // Build analysis prompt
    const prompt = this.buildHealthAnalysisPrompt(pet, vaccinations, medications, records);

    // Call DeepSeek for analysis
    const response = await this.deepseekProvider.chatWithRetry(
      [
        { role: 'system', content: 'You are a veterinary health analyst. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 2000 },
    );

    // Parse response
    let analysis: HealthhubResponseDto;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch?.[0] || response.content);
      analysis.pet_id = dto.pet_id;
      analysis.generated_at = new Date().toISOString();
    } catch {
      throw new Error('Failed to parse health analysis response');
    }

    // Cache result for 24 hours
    await this.redisService.set(`healthhub:${dto.pet_id}`, JSON.stringify(analysis), 86400);

    return analysis;
  }

  private buildHealthAnalysisPrompt(pet: any, vaccinations: any[], medications: any[], records: any[]): string {
    return `Analyze the health status of this pet and provide a risk assessment.

PET INFO:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed}
- Age: ${pet.age || 'Unknown'}
- Weight: ${pet.weight || 'Unknown'}

VACCINATIONS: ${JSON.stringify(vaccinations)}
MEDICATIONS: ${JSON.stringify(medications)}
RECENT RECORDS: ${JSON.stringify(records)}

Respond with JSON in this exact format:
{
  "risk_level": "low" | "medium" | "high",
  "overall_score": 0-100,
  "categories": [
    {
      "name": "Vaccinations",
      "score": 0-100,
      "status": "up-to-date" | "due-soon" | "overdue",
      "recommendations": ["..."]
    }
  ],
  "summary": "Brief overall health summary"
}`;
  }

  // ============================================
  // SOAP EXPAND - Migrated from soap-expand Edge Function
  // ============================================
  async expandSoap(dto: SoapExpandRequestDto, userId: string): Promise<SoapExpandResponseDto> {
    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:soap:${userId}`,
      30, // 30 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    // Fetch appointment and SOAP data
    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*, pets(*)')
      .eq('id', dto.appointment_id)
      .single();

    if (error || !appointment) {
      this.logger.warn(`Appointment not found: ${dto.appointment_id}`);
      throw new NotFoundException('Appointment', dto.appointment_id);
    }

    // Build expansion prompt
    const prompt = this.buildSoapExpansionPrompt(appointment, dto.current_data, dto.section);

    // Call DeepSeek for expansion
    const response = await this.deepseekProvider.chatWithRetry(
      [
        { role: 'system', content: 'You are a veterinary SOAP note assistant. Expand the provided notes professionally.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 2000 },
    );

    // Parse response
    let expanded: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      expanded = JSON.parse(jsonMatch?.[0] || response.content);
    } catch {
      // If not JSON, treat as plain text expansion
      expanded = { [dto.section || 'all']: response.content };
    }

    // Create snapshot for undo
    const snapshotId = uuidv4();
    await supabase.from('soap_snapshots').insert({
      id: snapshotId,
      appointment_id: dto.appointment_id,
      snapshot_data: dto.current_data,
      created_by: userId,
    });

    return {
      appointment_id: dto.appointment_id,
      expanded,
      snapshot_id: snapshotId,
    };
  }

  private buildSoapExpansionPrompt(appointment: any, currentData: any, section?: string): string {
    return `Expand the following SOAP notes for a veterinary appointment.

PET: ${appointment.pets?.name} (${appointment.pets?.species}, ${appointment.pets?.breed})
APPOINTMENT TYPE: ${appointment.service_type}

CURRENT NOTES:
${JSON.stringify(currentData || {}, null, 2)}

${section ? `Focus on expanding the "${section}" section.` : 'Expand all sections.'}

Respond with JSON containing the expanded sections:
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}`;
  }
}
