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
    imageUrlOrBase64: string,
    prompt: string,
    options: { model?: string; maxTokens?: number } = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o', maxTokens = 1000 } = options;

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
      max_tokens: maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Download image from URL and convert to base64 data URL
   */
  private async downloadImageAsBase64(url: string): Promise<string> {
    try {
      console.log(`[OpenAI Image Download] Starting download from: ${url}`);
      
      const response = await fetch(url);
      console.log(`[OpenAI Image Download] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      // Get content type from response headers
      let contentType = response.headers.get('content-type');
      console.log(`[OpenAI Image Download] Content-Type from header: ${contentType}`);
      
      // If no content type, try to determine from URL extension
      if (!contentType) {
        if (url.includes('.jpg') || url.includes('.jpeg')) {
          contentType = 'image/jpeg';
        } else if (url.includes('.png')) {
          contentType = 'image/png';
        } else if (url.includes('.gif')) {
          contentType = 'image/gif';
        } else if (url.includes('.webp')) {
          contentType = 'image/webp';
        } else {
          contentType = 'image/jpeg'; // Default to JPEG
        }
        console.log(`[OpenAI Image Download] Content-Type inferred from URL: ${contentType}`);
      }
      
      const fileSizeKB = (buffer.length / 1024).toFixed(2);
      const base64SizeKB = (base64.length / 1024).toFixed(2);
      
      console.log(`[OpenAI Image Download] SUCCESS - File size: ${fileSizeKB}KB, Base64 size: ${base64SizeKB}KB, Type: ${contentType}`);
      
      const dataUrl = `data:${contentType};base64,${base64}`;
      console.log(`[OpenAI Image Download] Data URL length: ${dataUrl.length} chars, First 100 chars: ${dataUrl.substring(0, 100)}`);
      
      return dataUrl;
    } catch (error) {
      console.error(`[OpenAI Image Download] ERROR downloading from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Analyze images using URLs (for vision models)
   * Downloads images and converts to base64 to avoid OpenAI timeout issues
   */
  async analyzeImageUrls(
    imageUrls: string[],
    systemPrompt: string,
    userPrompt: string,
    options: { model?: string; maxTokens?: number; temperature?: number } = {},
  ): Promise<AiChatResponse> {
    const { model = 'gpt-4o-mini', maxTokens = 1500, temperature = 0.3 } = options;

    console.log(`[OpenAI Vision] Starting image analysis with ${imageUrls.length} images`);
    console.log(`[OpenAI Vision] Model: ${model}, MaxTokens: ${maxTokens}, Temperature: ${temperature}`);

    // Download all images and convert to base64
    console.log(`[OpenAI Vision] Downloading ${imageUrls.length} images...`);
    const base64Images = await Promise.all(
      imageUrls.map(url => this.downloadImageAsBase64(url))
    );
    console.log(`[OpenAI Vision] Successfully downloaded ${base64Images.length} images`);

    // Build content array with text and images
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: userPrompt },
    ];

    // Add each image as base64
    for (let i = 0; i < base64Images.length; i++) {
      const base64Image = base64Images[i];
      console.log(`[OpenAI Vision] Adding image ${i + 1} to request - Data URL length: ${base64Image.length} chars`);
      userContent.push({
        type: 'image_url',
        image_url: {
          url: base64Image,
          detail: 'high', // Use high detail for accurate pet health analysis
        },
      });
    }

    console.log(`[OpenAI Vision] Sending request to OpenAI with ${userContent.length} content parts (1 text + ${base64Images.length} images)`);
    
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
      });

      console.log(`[OpenAI Vision] SUCCESS - Received response with ${response.usage?.total_tokens || 0} tokens used`);

      return {
        content: response.choices[0]?.message?.content || '',
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      console.error(`[OpenAI Vision] ERROR from OpenAI API:`, {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
      });
      throw error;
    }
  }
}
