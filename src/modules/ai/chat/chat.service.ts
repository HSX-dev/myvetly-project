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

    // Get client_id for session tracking
    const clientResult = await this.getSupabase()
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    const clientId = clientResult.data?.id;

    // Ensure session exists in database
    if (clientId) {
      const sessionExists = await this.getSupabase()
        .from('pawla_chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .maybeSingle();

      if (!sessionExists.data) {
        await this.getSupabase()
          .from('pawla_chat_sessions')
          .insert({
            id: sessionId,
            user_id: userId,
            client_id: clientId,
            pet_id: dto.pet_id || null,
          });
      }
    }

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

    // Save user message to database
    const userMessageId = uuidv4();
    if (clientId) {
      await this.getSupabase()
        .from('pawla_chat_messages')
        .insert({
          id: userMessageId,
          session_id: sessionId,
          role: 'user',
          content: dto.message,
          media_url: dto.images?.[0] || null,
          metadata: {
            image_count: dto.images?.length || 0,
            pet_id: dto.pet_id,
          },
        });
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(petContext);

    // Handle image analysis if provided - use vision API for multiple images
    let response: { content: string; tokensUsed: number };
    if (dto.images && dto.images.length > 0) {
      // Create a better default prompt for pet image analysis
      const imagePrompt = dto.message || 
        (dto.images.length > 1 
          ? 'Please analyze these photos of my pet. What do you observe about their appearance, behavior, and overall health?'
          : 'Please analyze this photo of my pet. What do you observe about their appearance, behavior, and overall health?');
      
      response = await this.openaiProvider.analyzeImageUrls(
        dto.images,
        systemPrompt,
        imagePrompt,
        {
          temperature: 0.7,
          maxTokens: 1500,
        }
      );
    } else {
      // Text-only chat
      response = await this.callOpenAI(systemPrompt, dto.message, {
        temperature: 0.7,
        maxTokens: 500,
      });
    }

    // Save assistant response to database
    const assistantMessageId = uuidv4();
    if (clientId) {
      await this.getSupabase()
        .from('pawla_chat_messages')
        .insert({
          id: assistantMessageId,
          session_id: sessionId,
          role: 'assistant',
          content: response.content,
          media_url: null,
          metadata: {
            tokens_used: response.tokensUsed,
            model: 'gpt-4o-mini',
            pet_context_used: !!dto.pet_id,
          },
        });
    }

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
