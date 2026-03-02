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
  responseFormat?: 'json' | 'text';
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
    const { model = 'gpt-5-mini', temperature = 0.7, maxTokens = 1000, responseFormat } = options;
    // gpt-5/mini/nano: reasoning models use max_completion_tokens (max 128k for gpt-5-mini); temperature omitted per API
    const isGpt5 = model.startsWith('gpt-5');

    const response = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      ...(isGpt5 ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
      ...(responseFormat === 'json' && { response_format: { type: 'json_object' } }),
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as { type: string; text?: string }[])
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text)
            .join('')
        : '';

    return {
      content,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  async analyzeImage(
    imageUrlOrBase64: string,
    prompt: string,
    options: { model?: string; maxTokens?: number } = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o', maxTokens = 1000 } = options;
    // gpt-5: use max_completion_tokens (temperature not sent for reasoning models)
    const isGpt5 = model.startsWith('gpt-5');

    // Determine if it's a URL or base64
    let imageUrl: string;
    if (imageUrlOrBase64.startsWith('http://') || imageUrlOrBase64.startsWith('https://')) {
      // It's a URL, use it directly
      imageUrl = imageUrlOrBase64;
    } else if (imageUrlOrBase64.startsWith('data:')) {
      // It's already a data URL
      imageUrl = imageUrlOrBase64;
    } else {
      // It's base64, convert to data URL
      imageUrl = `data:image/jpeg;base64,${imageUrlOrBase64}`;
    }

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
                url: imageUrl,
              },
            },
          ],
        },
      ],
      ...(isGpt5 ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as { type: string; text?: string }[])
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text)
            .join('')
        : '';

    return {
      content,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Chat with vision support for multiple images
   * Combines system prompt, user message, and multiple images in one request
   */
  async chatWithVision(
    systemPrompt: string,
    userMessage: string,
    images: string[],
    chatHistory: AiChatMessage[] = [],
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o', temperature = 0.7, maxTokens = 1000, responseFormat } = options;
    // gpt-5: max_completion_tokens only; temperature omitted for reasoning models
    const isGpt5 = model.startsWith('gpt-5');

    // Build image content parts
    const imageContent = images.map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: img.startsWith('data:') || img.startsWith('http')
          ? img
          : `data:image/jpeg;base64,${img}`,
      },
    }));

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      // Add chat history (excluding system messages)
      ...chatHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      // Current user message with images
      {
        role: 'user',
        content: [{ type: 'text', text: userMessage }, ...imageContent],
      },
    ];

    const response = await this.openai.chat.completions.create({
      model,
      messages,
      ...(isGpt5 ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
      ...(responseFormat === 'json' && { response_format: { type: 'json_object' } }),
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as { type: string; text?: string }[])
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text)
            .join('')
        : '';

    return {
      content,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Chat with conversation history (text only)
   */
  async chatWithHistory(
    systemPrompt: string,
    userMessage: string,
    chatHistory: AiChatMessage[] = [],
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-5-mini', temperature = 0.7, maxTokens = 1000 } = options;
    // gpt-5: max_completion_tokens only (max 128k for gpt-5-mini); temperature omitted
    const isGpt5 = model.startsWith('gpt-5');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.openai.chat.completions.create({
      model,
      messages,
      ...(isGpt5 ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as { type: string; text?: string }[])
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text)
            .join('')
        : '';

    return {
      content,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }
}
