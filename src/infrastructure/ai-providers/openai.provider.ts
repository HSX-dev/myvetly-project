import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResponse {
  content: string;
  tokensUsed: number;
}

@Injectable()
export class OpenaiProvider {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiApiKey'),
    });
  }

  async chat(
    messages: AiChatMessage[],
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o-mini', temperature = 0.7, maxTokens = 1000 } = options;

    const response = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature,
      max_tokens: maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options: { model?: string; maxTokens?: number } = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o', maxTokens = 1000 } = options;

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:')
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }
}
