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
    options: { temperature?: number; maxTokens?: number; model?: string; responseFormat?: 'json' | 'text' } = {},
  ) {
    const { temperature = 0.7, maxTokens = 1000, model = 'gpt-5-nano', responseFormat } = options;

    return this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model, temperature, maxTokens, responseFormat },
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
   * Parse JSON response with error handling.
   * Handles AI output with leading text and/or markdown code blocks (```json ... ```).
   */
  protected parseJsonResponse<T = any>(content: string): T {
    try {
      let cleaned = content.trim();

      // Extract from ```json ... ``` or ``` ... ``` (handles leading text like "I'm unable to...")
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      } else {
        // No code block: strip optional leading ```json/```
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();
      }

      // If still no JSON start, find first { and take to matching }
      if (!cleaned.startsWith('{')) {
        const start = cleaned.indexOf('{');
        if (start !== -1) {
          let depth = 0;
          let end = -1;
          for (let i = start; i < cleaned.length; i++) {
            if (cleaned[i] === '{') depth++;
            else if (cleaned[i] === '}') {
              depth--;
              if (depth === 0) {
                end = i;
                break;
              }
            }
          }
          if (end !== -1) cleaned = cleaned.slice(start, end + 1);
        }
      }

      let parsed: T;
      try {
        parsed = JSON.parse(cleaned) as T;
      } catch {
        // Possibly truncated: close open brackets and try again
        const openBraces = (cleaned.match(/{/g) || []).length - (cleaned.match(/}/g) || []).length;
        const openBrackets = (cleaned.match(/\[/g) || []).length - (cleaned.match(/]/g) || []).length;
        const repair = ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
        if (repair) {
          try {
            parsed = JSON.parse(cleaned + repair) as T;
          } catch {
            this.logger.error('Failed to parse AI response', {
              contentLength: content?.length,
              tail: content?.slice(-400),
            });
            throw new BadRequestException('Failed to parse AI response');
          }
        } else {
          this.logger.error('Failed to parse AI response', {
            contentLength: content?.length,
            tail: content?.slice(-400),
          });
          throw new BadRequestException('Failed to parse AI response');
        }
      }
      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Failed to parse AI response', {
        contentLength: content?.length,
        tail: content?.slice(-400),
        error: (error as Error)?.message,
      });
      throw new BadRequestException('Failed to parse AI response');
    }
  }

  /**
   * Calculate age from birth date
   */
  protected calculateAge(birthDate: string): string {
    const birth = new Date(birthDate);
    const now = new Date();
    
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    
    // Adjust if birthday hasn't occurred yet this year
    if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
      years--;
      months += 12;
    }
    
    // Adjust months if day hasn't passed
    if (now.getDate() < birth.getDate()) {
      months--;
      if (months < 0) months += 12;
    }
    
    if (years < 1) {
      return `${Math.max(0, months)} month${months !== 1 ? 's' : ''}`;
    }
    
    if (months > 0) {
      return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
    }
    
    return `${years} year${years !== 1 ? 's' : ''}`;
  }

  /**
   * Log operation timing
   */
  protected logTiming(operation: string, startTime: number, metadata?: Record<string, any>) {
    const duration = Date.now() - startTime;
    this.logger.log(`${operation} completed in ${duration}ms`, metadata);
  }
}
