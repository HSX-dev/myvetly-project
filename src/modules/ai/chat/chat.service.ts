import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import {
  OpenaiProvider,
  DeepseekProvider,
  AiChatMessage,
} from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { ChatRequestDto, ChatResponseDto, ChatMetadata } from './chat.dto';
import { processDocuments } from '../shared/document-utils';
import { fetchImagesAsBase64 } from '../shared/image-utils';
import { v4 as uuidv4 } from 'uuid';

const MAX_CONTEXT_MESSAGES = 20;
/** Only messages from the last N hours are sent to the model (avoids re-sending old images). */
const CHAT_HISTORY_WINDOW_HOURS = 1;

// Cost per 1K tokens (approximate)
const PRICING = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-5-mini': { input: 0.0002, output: 0.0006 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
};

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

    // Get or create session
    await this.ensureSession(sessionId, userId, dto.pet_id);

    // Get pet context if provided
    const { petContext, appointmentsReferenced } = await this.getPetContext(
      dto.pet_id,
    );

    // Get chat history
    const chatHistory = await this.getChatHistory(sessionId);

    // Build system prompt with pet context and optional PawScan context
    const systemPrompt = this.buildSystemPrompt(petContext, dto.pawscan_context);

    // Process documents if provided
    let documentContent = '';
    if (dto.documents && dto.documents.length > 0) {
      documentContent = await processDocuments(dto.documents);
    }

    // Build user message with document content
    let userMessage = dto.message;
    if (documentContent) {
      userMessage = `${dto.message}\n\n${documentContent}`;
    }

    // Persist image URLs in metadata when client sends URLs (for follow-up context)
    const imageUrls =
      dto.images?.filter(
        (u) => typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'))
      ) ?? [];
    await this.storeMessage(sessionId, 'user', dto.message, {
      has_images: dto.images && dto.images.length > 0,
      has_documents: dto.documents && dto.documents.length > 0,
      image_count: dto.images?.length || 0,
      document_count: dto.documents?.length || 0,
      ...(imageUrls.length > 0 && { image_urls: imageUrls }),
    });

    // Images may be URLs or data URLs/base64; fetchImagesAsBase64 short-circuits non-URLs
    let hasImages = !!(dto.images && dto.images.length > 0);
    let imagesForVision: string[] = hasImages
      ? await fetchImagesAsBase64(dto.images!)
      : [];
    // Re-attach last in-window user message's images for text-only follow-ups
    if (!hasImages && imagesForVision.length === 0 && chatHistory.length > 0) {
      const withMeta = chatHistory as Array<AiChatMessage & { metadata?: { image_urls?: string[] } }>;
      const lastWithImages = [...withMeta]
        .reverse()
        .find((m) => m.role === 'user' && m.metadata?.image_urls?.length);
      if (lastWithImages?.metadata?.image_urls?.length) {
        imagesForVision = await fetchImagesAsBase64(lastWithImages.metadata.image_urls);
        hasImages = imagesForVision.length > 0;
      }
    }
    const aiResult = await this.callWithFallback(
      systemPrompt,
      userMessage,
      imagesForVision,
      chatHistory,
      hasImages,
    );

    // Calculate cost
    const costUsd = this.calculateCost(
      aiResult.model,
      aiResult.tokensUsed,
      aiResult.tokensUsed * 0.3, // Rough estimate: 30% input tokens
    );

    // Store assistant message
    await this.storeMessage(sessionId, 'assistant', aiResult.content, {
      model_used: aiResult.model,
      tokens_used: aiResult.tokensUsed,
      used_fallback: aiResult.usedFallback,
      cost_usd: costUsd,
    });

    // Update session
    await this.updateSession(sessionId);

    this.logTiming('Chat', startTime, {
      userId,
      hasImages,
      hasDocuments: !!documentContent,
      model: aiResult.model,
    });

    const metadata: ChatMetadata = {
      pet_context_used: !!petContext,
      appointments_referenced: appointmentsReferenced,
      model_used: aiResult.model,
      used_fallback: aiResult.usedFallback,
      cost_usd: costUsd,
    };

    return {
      response: aiResult.content,
      session_id: sessionId,
      tokens_used: aiResult.tokensUsed,
      metadata,
    };
  }

  /**
   * Get pet context from cache or database
   */
  private async getPetContext(
    petId?: string,
  ): Promise<{ petContext: string; appointmentsReferenced: boolean }> {
    if (!petId) {
      return { petContext: '', appointmentsReferenced: false };
    }

    const cached = await this.redisService.getCachedPetContext(petId);
    if (cached) {
      const appointments = (cached as any).appointments || [];
      return {
        petContext: JSON.stringify(cached),
        appointmentsReferenced: appointments.length > 0,
      };
    }

    const [pet, records, appointments] = await Promise.all([
      this.supabaseService.getPetContext(petId),
      this.supabaseService.getPetMedicalRecords(petId, 5),
      this.supabaseService.getPetAppointments(petId, 5),
    ]);

    const context = { pet, records, appointments };
    this.redisService.cachePetContext(petId, context, 300);

    return {
      petContext: JSON.stringify(context),
      appointmentsReferenced: appointments && appointments.length > 0,
    };
  }

  /**
   * Get chat history for a session (max 20 messages, time-bound to last CHAT_HISTORY_WINDOW_HOURS).
   */
  private async getChatHistory(sessionId: string): Promise<AiChatMessage[]> {
    const since = new Date(Date.now() - CHAT_HISTORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await this.getSupabase()
      .from('pawla_chat_messages')
      .select('role, content, metadata, created_at')
      .eq('session_id', sessionId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(MAX_CONTEXT_MESSAGES);

    return (data || []).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      metadata: msg.metadata,
    }));
  }

  /**
   * Ensure session exists, create if not
   */
  private async ensureSession(
    sessionId: string,
    userId: string,
    petId?: string,
  ): Promise<void> {
    const { data: existing } = await this.getSupabase()
      .from('pawla_chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    if (!existing) {
      // Get client_id from user
      const { data: client } = await this.getSupabase()
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .single();

      await this.getSupabase()
        .from('pawla_chat_sessions')
        .insert({
          id: sessionId,
          client_id: client?.id,
          pet_id: petId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    } else if (petId) {
      // Update pet_id if provided
      await this.getSupabase()
        .from('pawla_chat_sessions')
        .update({ pet_id: petId, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
  }

  /**
   * Update session timestamp
   */
  private async updateSession(sessionId: string): Promise<void> {
    await this.getSupabase()
      .from('pawla_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  /**
   * Store a message in the database
   */
  private async storeMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.getSupabase().from('pawla_chat_messages').insert({
      session_id: sessionId,
      role,
      content,
      metadata,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Call AI with fallback logic
   * - Images: Try GPT-4o, fallback to DeepSeek text-only
   * - No images: Use gpt-5-mini
   */
  private async callWithFallback(
    systemPrompt: string,
    userMessage: string,
    images: string[],
    chatHistory: AiChatMessage[],
    hasImages: boolean,
  ): Promise<{
    content: string;
    tokensUsed: number;
    model: string;
    usedFallback: boolean;
  }> {
    if (hasImages && images.length > 0) {
      // Try OpenAI with vision
      try {
        const response = await this.openaiProvider.chatWithVision(
          systemPrompt,
          userMessage,
          images,
          chatHistory,
          { model: 'gpt-4o', temperature: 0.7, maxTokens: 4000 },
        );
        return {
          content: response.content,
          tokensUsed: response.tokensUsed,
          model: 'gpt-4o',
          usedFallback: false,
        };
      } catch (error) {
        this.logger.warn('OpenAI vision failed, falling back to DeepSeek', {
          error,
        });
        // Fallback to DeepSeek text-only (without images)
        const response = await this.callDeepSeekWithHistory(
          systemPrompt,
          userMessage,
          chatHistory,
        );
        return {
          content: response.content,
          tokensUsed: response.tokensUsed,
          model: 'deepseek-chat',
          usedFallback: true,
        };
      }
    }

    // No images: Use gpt-5-mini
    const response = await this.openaiProvider.chatWithHistory(
      systemPrompt,
      userMessage,
      chatHistory,
      { model: 'gpt-5-mini', temperature: 0.7, maxTokens: 4000 },
    );
    return {
      content: response.content,
      tokensUsed: response.tokensUsed,
      model: 'gpt-5-mini',
      usedFallback: false,
    };
  }

  /**
   * Call DeepSeek with chat history
   */
  private async callDeepSeekWithHistory(
    systemPrompt: string,
    userMessage: string,
    chatHistory: AiChatMessage[],
  ): Promise<{ content: string; tokensUsed: number }> {
    const messages: AiChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: userMessage },
    ];

    return this.deepseekProvider.chatWithRetry(messages, {
      temperature: 0.7,
      maxTokens: 4000,
    });
  }

  /**
   * Build system prompt with pet context and optional PawScan context
   */
  private buildSystemPrompt(petContext: string, pawscanContext?: string): string {
    // Always include current date so AI knows what day it is
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const basePrompt = `${AI_PROMPTS.CHAT_SYSTEM}\n\nCURRENT DATE: ${dateStr}`;
    let fullPrompt = basePrompt;

    if (petContext) {
      // Parse and format pet context nicely
      try {
        const context = JSON.parse(petContext);
        const pet = context.pet || {};
        const records = context.records || [];
        const appointments = context.appointments || [];

        let contextStr = `\n\nPET CONTEXT:`;
        if (pet.name) {
          contextStr += `\n- Name: ${pet.name}`;
        }
        if (pet.species) {
          contextStr += `\n- Species: ${pet.species}`;
        }
        if (pet.breed) {
          contextStr += `\n- Breed: ${pet.breed}`;
        }
        if (pet.weight) {
          // Parse weight unit from notes field (stored as JSON by PawMD app)
          let weightUnit = 'lbs'; // Default to lbs (app default)
          if (pet.notes) {
            try {
              const notesData = JSON.parse(pet.notes);
              if (notesData.weightUnit) {
                weightUnit = notesData.weightUnit === 'kg' ? 'kg' : 'lbs';
              }
            } catch {
              // Notes not valid JSON, use default
            }
          }
          contextStr += `\n- Weight: ${pet.weight} ${weightUnit}`;
        }
        if (pet.birth_date) {
          const age = this.calculateAge(pet.birth_date);
          contextStr += `\n- Age: ${age}`;
        }
        if (pet.gender || pet.sex) {
          contextStr += `\n- Gender: ${pet.gender || pet.sex}`;
        }
        if (pet.reproductive_status) {
          contextStr += `\n- Reproductive Status: ${pet.reproductive_status}`;
        }
        if (pet.allergies) {
          contextStr += `\n- Allergies: ${pet.allergies}`;
        }

        if (records.length > 0) {
          contextStr += `\n\nRECENT MEDICAL RECORDS:`;
          records.slice(0, 3).forEach((record: any) => {
            const date = record.created_at
              ? new Date(record.created_at).toLocaleDateString()
              : 'Unknown';
            const diagnosis = record.diagnosis
              ? record.diagnosis.substring(0, 100)
              : 'No diagnosis';
            contextStr += `\n- ${date}: ${diagnosis}`;
          });
        }

        if (appointments.length > 0) {
          contextStr += `\n\nUPCOMING APPOINTMENTS:`;
          appointments.slice(0, 2).forEach((apt: any) => {
            const date = apt.scheduled_at
              ? new Date(apt.scheduled_at).toLocaleDateString()
              : 'Unknown';
            contextStr += `\n- ${date}: ${apt.service_type || 'Appointment'}`;
          });
        }

        fullPrompt = `${basePrompt}${contextStr}`;
      } catch {
        // If parsing fails, use truncated raw context
        const truncated =
          petContext.length > 500
            ? petContext.substring(0, 500) + '...'
            : petContext;
        fullPrompt = `${basePrompt}\n\nPet info: ${truncated}`;
      }
    }

    // Add PawScan context if provided
    if (pawscanContext) {
      try {
        const scan = JSON.parse(pawscanContext);
        let scanStr = `\n\nRECENT PAWSCAN RESULTS (User is asking about this scan):`;
        
        if (scan.diagnosis) {
          scanStr += `\n- Diagnosis: ${scan.diagnosis}`;
        }
        if (scan.prognosis) {
          scanStr += `\n- Prognosis: ${scan.prognosis}`;
        }
        if (scan.severity) {
          const scoreStr = scan.severityScore ? ` (${scan.severityScore}/5)` : '';
          scanStr += `\n- Severity: ${scan.severity}${scoreStr}`;
        }
        if (scan.vetAction) {
          const actionLabels: Record<string, string> = {
            'urgent_care': 'Urgent care needed',
            'see_vet': 'See a vet',
            'monitor': 'Monitor at home',
          };
          scanStr += `\n- Recommended Action: ${actionLabels[scan.vetAction] || scan.vetAction}`;
        }
        if (scan.triage) {
          scanStr += `\n- Initial Assessment: ${scan.triage}`;
        }
        if (scan.recommendations && Array.isArray(scan.recommendations) && scan.recommendations.length > 0) {
          scanStr += `\n- Recommendations:`;
          scan.recommendations.slice(0, 5).forEach((rec: string) => {
            scanStr += `\n  • ${rec}`;
          });
        }
        if (scan.riskFlags && Array.isArray(scan.riskFlags) && scan.riskFlags.length > 0) {
          scanStr += `\n- Risk Flags:`;
          scan.riskFlags.forEach((flag: string) => {
            scanStr += `\n  ⚠️ ${flag}`;
          });
        }
        
        scanStr += `\n\nIMPORTANT: The user has just completed a PawScan and wants to discuss these results. Acknowledge that you can see their scan results and offer to help explain or answer questions about the diagnosis, prognosis, or recommendations. Be supportive and informative.`;
        
        fullPrompt += scanStr;
      } catch {
        // If parsing fails, just mention we have scan context
        fullPrompt += `\n\nNote: User has recent PawScan results they want to discuss.`;
      }
    }

    return fullPrompt;
  }

  /**
   * Attach image URLs to the most recent user message in the session (called by client after deferred upload).
   */
  async attachMessageImageUrls(
    sessionId: string,
    imageUrls: string[],
    userId: string,
  ): Promise<{ ok: boolean }> {
    if (!sessionId || !imageUrls?.length) return { ok: false };
    const { data: messages } = await this.getSupabase()
      .from('pawla_chat_messages')
      .select('id, role, metadata')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1);
    const last = messages?.[0];
    if (!last || last.role !== 'user') return { ok: false };
    const metadata = (last.metadata as Record<string, unknown>) ?? {};
    const updated = { ...metadata, image_urls: imageUrls };
    await this.getSupabase()
      .from('pawla_chat_messages')
      .update({ metadata: updated })
      .eq('id', last.id);
    return { ok: true };
  }

  /**
   * Calculate cost based on model and tokens
   */
  private calculateCost(
    model: string,
    totalTokens: number,
    inputTokens: number,
  ): number {
    const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-5-mini'];
    const outputTokens = totalTokens - inputTokens;
    return (
      (inputTokens / 1000) * pricing.input +
      (outputTokens / 1000) * pricing.output
    );
  }
}
