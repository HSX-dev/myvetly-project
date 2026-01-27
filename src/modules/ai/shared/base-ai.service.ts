import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider } from '../../../infrastructure/ai-providers';
import { DeepseekProvider } from '../../../infrastructure/ai-providers';
import {
  RateLimitException,
  NotFoundException,
  BadRequestException,
} from '../../../common/exceptions';

export interface AiServiceDependencies {
  supabaseService: SupabaseService;
  redisService: RedisService;
  openaiProvider: OpenaiProvider;
  deepseekProvider: DeepseekProvider;
}

@Injectable()
export abstract class BaseAiService {
  protected readonly logger: Logger;

  constructor(
    protected readonly supabaseService: SupabaseService,
    protected readonly redisService: RedisService,
    protected readonly openaiProvider: OpenaiProvider,
    protected readonly deepseekProvider: DeepseekProvider,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Check rate limit and throw if exceeded
   */
  protected async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number = 3600,
  ): Promise<void> {
    const result = await this.redisService.checkRateLimit(key, maxRequests, windowSeconds);
    if (!result.allowed) {
      this.logger.warn(`Rate limit exceeded for ${key}`);
      throw new RateLimitException();
    }
  }

  /**
   * Get Supabase client
   */
  protected getSupabase() {
    return this.supabaseService.getClient();
  }

  /**
   * Fetch pet by ID with validation
   */
  protected async getPetById(petId: string, select: string = '*'): Promise<any> {
    const { data: pet, error } = await this.getSupabase()
      .from('pets')
      .select(select)
      .eq('id', petId)
      .single();

    if (error || !pet) {
      throw new NotFoundException('Pet', petId);
    }

    return pet as any;
  }

  /**
   * Call OpenAI with standard options
   */
  protected async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ) {
    const { temperature = 0.7, maxTokens = 1000 } = options;

    return this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'gpt-4o-mini', temperature, maxTokens },
    );
  }

  /**
   * Call DeepSeek with retry
   */
  protected async callDeepSeek(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ) {
    const { temperature = 0.5, maxTokens = 2000 } = options;

    return this.deepseekProvider.chatWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature, maxTokens },
    );
  }

  /**
   * Parse JSON response with error handling
   */
  protected parseJsonResponse<T = any>(content: string): T {
    try {
      // Clean markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      
      return JSON.parse(cleaned.trim());
    } catch (error) {
      this.logger.error('Failed to parse AI response', { content });
      throw new BadRequestException('Failed to parse AI response');
    }
  }

  /**
   * Calculate age from birth date
   */
  protected calculateAge(birthDate: string): string {
    const birth = new Date(birthDate);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    
    if (years < 1) {
      return `${Math.max(0, years * 12 + months)} months`;
    }
    return `${years} year${years > 1 ? 's' : ''}`;
  }

  /**
   * Log operation timing
   */
  protected logTiming(operation: string, startTime: number, metadata?: Record<string, any>) {
    const duration = Date.now() - startTime;
    this.logger.log(`${operation} completed in ${duration}ms`, metadata);
  }
}
