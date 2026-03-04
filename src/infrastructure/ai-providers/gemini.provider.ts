import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { AiChatMessage, AiChatOptions, AiChatResponse } from './openai.provider';

const GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

@Injectable()
export class GeminiProvider {
  private ai: GoogleGenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.geminiApiKey');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.ai != null;
  }

  async chat(
    messages: AiChatMessage[],
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    if (!this.ai) throw new Error('Gemini API key not configured');
    const { maxTokens = 1000, responseFormat } = options;
    const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    const fullPrompt = systemMsg
      ? `${systemMsg}\n\n${userMsg}`
      : userMsg;

    const response = await this.ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: fullPrompt,
      config: {
        maxOutputTokens: maxTokens,
        ...(responseFormat === 'json' && { responseMimeType: 'application/json' as const }),
      },
    } as Parameters<typeof this.ai.models.generateContent>[0]);

    const text = response.text ?? '';
    const tokensUsed =
      (response.usageMetadata as { totalTokenCount?: number } | undefined)?.totalTokenCount ?? 0;
    return { content: text, tokensUsed };
  }

  async chatWithVision(
    systemPrompt: string,
    userMessage: string,
    images: string[],
    _chatHistory: AiChatMessage[] = [],
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    if (!this.ai) throw new Error('Gemini API key not configured');
    const { maxTokens = 1000, responseFormat } = options;

    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

    for (const img of images) {
      const { mimeType, data } = this.parseImageToInlineData(img);
      parts.push({ inlineData: { mimeType, data } });
    }
    parts.push({ text: `${systemPrompt}\n\n${userMessage}` });

    const response = await this.ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: parts,
      config: {
        maxOutputTokens: maxTokens,
        ...(responseFormat === 'json' && { responseMimeType: 'application/json' as const }),
      },
    } as Parameters<typeof this.ai.models.generateContent>[0]);

    const text = response.text ?? '';
    const tokensUsed =
      (response.usageMetadata as { totalTokenCount?: number } | undefined)?.totalTokenCount ?? 0;
    return { content: text, tokensUsed };
  }

  async analyzeImage(
    imageUrlOrBase64: string,
    prompt: string,
    options: { model?: string; maxTokens?: number } = {},
  ): Promise<AiChatResponse> {
    if (!this.ai) throw new Error('Gemini API key not configured');
    const { maxTokens = 1000 } = options;
    const { mimeType, data } = this.parseImageToInlineData(imageUrlOrBase64);

    const response = await this.ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: [{ inlineData: { mimeType, data } }, { text: prompt }],
      config: { maxOutputTokens: maxTokens },
    } as Parameters<typeof this.ai.models.generateContent>[0]);

    const text = response.text ?? '';
    const tokensUsed =
      (response.usageMetadata as { totalTokenCount?: number } | undefined)?.totalTokenCount ?? 0;
    return { content: text, tokensUsed };
  }

  private parseImageToInlineData(img: string): { mimeType: string; data: string } {
    if (img.startsWith('http://') || img.startsWith('https://')) {
      throw new Error('GeminiProvider: URL images must be fetched to base64 first');
    }
    let data: string;
    let mimeType = 'image/jpeg';
    if (img.startsWith('data:')) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        data = match[2];
      } else {
        data = img.replace(/^data:[^;]+;base64,/, '');
      }
    } else {
      data = img;
    }
    return { mimeType, data };
  }
}
