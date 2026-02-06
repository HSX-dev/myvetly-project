import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { FoodScanRequestDto, FoodScanResponseDto } from './food-scan.dto';

@Injectable()
export class FoodScanService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(dto: FoodScanRequestDto, userId: string): Promise<FoodScanResponseDto> {
    const startTime = Date.now();

    console.log('🍕 [VETLY-API] Food Scan called!', {
      userId,
      petId: dto.pet_id,
      hasImages: dto.image_urls && dto.image_urls.length > 0,
      foodName: dto.food_name,
    });

    await this.checkRateLimit(
      `rate:foodscan:${userId}`,
      RATE_LIMITS.FOOD_SCAN.maxRequests,
      RATE_LIMITS.FOOD_SCAN.windowSeconds,
    );

    // Validate images if provided
    if (dto.image_urls && dto.image_urls.length > 0) {
      await this.validateImages(dto.image_urls);
    }

    const pet = await this.getPetById(dto.pet_id, 'id, client_id, name, species, breed, weight');

    // If images provided, use vision API with pre-check
    let userPrompt: string;
    let response: { content: string };

    if (dto.image_urls && dto.image_urls.length > 0) {
      // Pre-check: Verify the image contains food
      const isValidFoodImage = await this.preCheckFoodImage(dto.image_urls[0]);
      if (!isValidFoodImage.isFood) {
        throw new BadRequestException(
          `Invalid image: ${isValidFoodImage.reason}. Please upload a clear photo of food, a food label, or food packaging.`
        );
      }

      // Build prompt for image analysis
      userPrompt = this.buildImageAnalysisPrompt(dto, pet);
      response = await this.openaiProvider.analyzeImageUrls(
        dto.image_urls,
        AI_PROMPTS.FOOD_SCAN_SYSTEM,
        userPrompt,
        { temperature: 0.3, maxTokens: 1200 }
      );
    } else {
      // Text-only analysis
      userPrompt = this.buildUserPrompt(dto, pet);
      response = await this.callOpenAI(AI_PROMPTS.FOOD_SCAN_SYSTEM, userPrompt, {
        temperature: 0.3,
        maxTokens: 1200,
      });
    }

    const latency = Date.now() - startTime;
    const result = this.parseJsonResponse(response.content);

    // Validate food_type against allowed values
    const validFoodTypes = ['kibble', 'wet_food', 'raw', 'treat', 'human_food', 'supplement', 'other'];
    const foodType = result.food_type || dto.food_type || 'other';
    const validatedFoodType = validFoodTypes.includes(foodType) ? foodType : 'other';

    // Store scan in database
    const { data: scan, error: insertError } = await this.getSupabase()
      .from('food_scans')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        food_name: result.food_name || dto.food_name,
        food_type: validatedFoodType,
        scan_type: result.scan_type || dto.scan_type || 'food_item',
        model_used: 'gpt-4o-mini',
        ai_response: result,
        safety_rating: result.safety_rating,
        toxicity_score: result.toxicity_score,
        pawmd_score: result.pawmd_score?.score,
        pawmd_score_data: result.pawmd_score,
        ingredients: result.ingredients || [],
        toxic_ingredients: result.toxic_ingredients || [],
        nutritional_value: result.nutritional_value,
        recommended_serving: result.recommended_serving,
        warnings: result.warnings || [],
        health_benefits: result.health_benefits,
        status: 'completed',
        latency_ms: latency,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('❌ [FoodScan] Database insert failed:', insertError);
      throw new BadRequestException(`Failed to save scan: ${insertError.message}`);
    }

    if (!scan?.id) {
      console.error('❌ [FoodScan] No scan ID returned from database');
      throw new BadRequestException('Failed to generate scan ID');
    }

    console.log('✅ [FoodScan] Scan saved to database:', scan.id);
    this.logTiming('FoodScan analyze', startTime);

    return {
      scan_id: scan.id,
      analysis: result,
      latency_ms: latency,
      cost_usd: 0,
      model: 'gpt-4o-mini',
    };
  }

  private buildUserPrompt(dto: FoodScanRequestDto, pet: any): string {
    return `FOOD SAFETY ANALYSIS

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.weight}kg)

FOOD:
- Name: ${dto.food_name || 'Analyze from description'}
- Type: ${dto.food_type || 'Unknown'}

Analyze if this food is safe for this pet. Return JSON only.`;
  }

  private buildImageAnalysisPrompt(dto: FoodScanRequestDto, pet: any): string {
    return `FOOD SAFETY ANALYSIS FROM IMAGE

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.weight}kg)

INSTRUCTIONS:
1. Analyze the food shown in the image(s)
2. Identify the food item, ingredients (if visible on label), or food type
3. Determine if this food is safe for the pet
${dto.food_name ? `4. User described the food as: "${dto.food_name}"` : ''}
${dto.food_type ? `5. Food type hint: ${dto.food_type}` : ''}

Return a JSON response with your analysis.`;
  }

  private async validateImages(imageUrls: string[]): Promise<void> {
    const validationPromises = imageUrls.map(async (url) => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
          throw new BadRequestException(`Image URL is not accessible: ${url}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.startsWith('image/')) {
          throw new BadRequestException(`URL does not point to a valid image: ${url}`);
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(`Failed to validate image URL: ${url}`);
      }
    });

    await Promise.all(validationPromises);
  }

  private async preCheckFoodImage(imageUrl: string): Promise<{ isFood: boolean; reason: string }> {
    const preCheckPrompt = `Analyze this image and determine if it contains food, a food label, or food packaging.

RESPOND WITH ONLY A JSON OBJECT:
{
  "is_food": true/false,
  "reason": "brief explanation"
}

Examples of VALID images (is_food: true):
- Photo of actual food items (fruits, vegetables, meat, pet food, etc.)
- Food product labels or nutrition facts
- Food packaging (bags, cans, boxes of food)
- Pet treats or pet food bowls

Examples of INVALID images (is_food: false):
- Selfies or photos of people
- Photos of pets without food
- Random objects, furniture, or scenery
- Blurry or unrecognizable images
- Screenshots or documents (unless nutrition label)`;

    try {
      const response = await this.openaiProvider.analyzeImageUrls(
        [imageUrl],
        'You are an image classifier that determines if an image contains food or food-related content.',
        preCheckPrompt,
        { temperature: 0.1, maxTokens: 100 }
      );

      const result = this.parseJsonResponse(response.content);
      return {
        isFood: result.is_food === true,
        reason: result.reason || 'Unable to determine image content',
      };
    } catch (error) {
      // If pre-check fails, allow the image through but log warning
      console.warn('[FoodScan] Pre-check failed, allowing image through:', error);
      return { isFood: true, reason: 'Pre-check skipped' };
    }
  }
}
