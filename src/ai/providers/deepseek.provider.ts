import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

interface DeepseekResponse {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class DeepseekProvider {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ai.deepseekApiKey') || '';
  }

  async chat(
    messages: ChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<{ content: string; tokensUsed: number }> {
    const { model = 'deepseek-chat', temperature = 0.7, maxTokens = 2000 } = options;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data: DeepseekResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  async chatWithRetry(
    messages: ChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      maxRetries?: number;
    } = {},
  ): Promise<{ content: string; tokensUsed: number }> {
    const { maxRetries = 3, ...chatOptions } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat(messages, chatOptions);
      } catch (error) {
        lastError = error as Error;
        console.warn(`DeepSeek attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }
}
