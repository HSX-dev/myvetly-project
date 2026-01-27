import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { ChatRequestDto, ChatResponseDto } from './chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async chat(dto: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    const startTime = Date.now();
    const sessionId = dto.session_id || uuidv4();

    // Check rate limit
    await this.checkRateLimit(
      `rate:chat:${userId}`,
      RATE_LIMITS.CHAT.maxRequests,
      RATE_LIMITS.CHAT.windowSeconds,
    );

    // Get pet context if provided
    let petContext = '';
    if (dto.pet_id) {
      const cached = await this.redisService.getCachedPetContext(dto.pet_id);
      if (cached) {
        petContext = JSON.stringify(cached);
      } else {
        const [pet, records, appointments] = await Promise.all([
          this.supabaseService.getPetContext(dto.pet_id),
          this.supabaseService.getPetMedicalRecords(dto.pet_id, 3),
          this.supabaseService.getPetAppointments(dto.pet_id, 2),
        ]);
        const context = { pet, records, appointments };
        this.redisService.cachePetContext(dto.pet_id, context, 300);
        petContext = JSON.stringify(context);
      }
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(petContext);

    // Handle image analysis if provided
    let message = dto.message;
    if (dto.images && dto.images.length > 0) {
      const imageAnalysis = await this.openaiProvider.analyzeImage(
        dto.images[0],
        'Analyze this pet image. Focus on health-related observations.',
      );
      message = `[Image Analysis: ${imageAnalysis.content}]\n\nUser question: ${dto.message}`;
    }

    // Call OpenAI
    const response = await this.callOpenAI(systemPrompt, message, {
      temperature: 0.7,
      maxTokens: 500,
    });

    this.logTiming('Chat', startTime, { userId, hasImage: !!dto.images?.length });

    return {
      response: response.content,
      session_id: sessionId,
      tokens_used: response.tokensUsed,
    };
  }

  private buildSystemPrompt(petContext: string): string {
    if (petContext) {
      const truncated = petContext.length > 500 ? petContext.substring(0, 500) + '...' : petContext;
      return `${AI_PROMPTS.CHAT_SYSTEM}\n\nPet info: ${truncated}`;
    }
    return AI_PROMPTS.CHAT_SYSTEM;
  }
}
