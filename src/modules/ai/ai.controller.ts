import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

// Services
import { ChatService } from './chat/chat.service';
import { PawscanService } from './pawscan/pawscan.service';
import { FoodScanService } from './food-scan/food-scan.service';
import { NutritionService } from './nutrition/nutrition.service';
import { TrainingService } from './training/training.service';
import { GroomingService } from './grooming/grooming.service';
import { HealthhubService } from './healthhub/healthhub.service';
import { SoapService } from './soap/soap.service';

// DTOs
import { ChatRequestDto, AttachMessageImagesDto } from './chat/chat.dto';
import { PawScanRequestDto } from './pawscan/pawscan.dto';
import { FoodScanRequestDto } from './food-scan/food-scan.dto';
import { NutritionAnalyzeRequestDto } from './nutrition/nutrition.dto';
import { TrainingAnalyzeRequestDto } from './training/training.dto';
import { GroomingPlanRequestDto } from './grooming/grooming.dto';
import { HealthhubRequestDto } from './healthhub/healthhub.dto';
import { SoapExpandRequestDto, SoapUndoRequestDto } from './soap/soap.dto';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    private readonly chatService: ChatService,
    private readonly pawscanService: PawscanService,
    private readonly foodScanService: FoodScanService,
    private readonly nutritionService: NutritionService,
    private readonly trainingService: TrainingService,
    private readonly groomingService: GroomingService,
    private readonly healthhubService: HealthhubService,
    private readonly soapService: SoapService,
  ) {}

  // ============================================
  // CHAT (Pawla)
  // ============================================
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto, @Request() req: any) {
    return this.chatService.chat(dto, req.user.sub);
  }

  @Post('chat/attach-message-images')
  @HttpCode(HttpStatus.OK)
  async attachMessageImages(
    @Body() dto: AttachMessageImagesDto,
    @Request() req: any,
  ) {
    return this.chatService.attachMessageImageUrls(
      dto.session_id,
      dto.image_urls,
      req.user.sub,
    );
  }

  // ============================================
  // PAWSCAN - Symptom Triage
  // ============================================
  @Post('pawscan')
  @HttpCode(HttpStatus.OK)
  async pawscan(@Body() dto: PawScanRequestDto, @Request() req: any) {
    return this.pawscanService.analyze(dto, req.user.sub);
  }

  // ============================================
  // FOOD SCAN - Food Safety
  // ============================================
  @Post('food-scan')
  @HttpCode(HttpStatus.OK)
  async foodScan(@Body() dto: FoodScanRequestDto, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const FOOD_SCAN_TIMEOUT_MS = 55_000; // Slightly under client timeout so we return 504 instead of client timing out
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new HttpException(
        'Food scan took too long. Please try again.',
        HttpStatus.GATEWAY_TIMEOUT,
      )), FOOD_SCAN_TIMEOUT_MS)
    );
    return Promise.race([
      this.foodScanService.analyze(dto, userId),
      timeoutPromise,
    ]);
  }

  // ============================================
  // NUTRITION - Meal Planning
  // ============================================
  @Post('nutrition')
  @HttpCode(HttpStatus.OK)
  async nutrition(@Body() dto: NutritionAnalyzeRequestDto, @Request() req: any) {
    return this.nutritionService.analyze(dto, req.user.sub);
  }

  // ============================================
  // TRAINING - Behavior Training
  // ============================================
  @Post('training')
  @HttpCode(HttpStatus.OK)
  async training(@Body() dto: TrainingAnalyzeRequestDto, @Request() req: any) {
    return this.trainingService.analyze(dto, req.user.sub);
  }

  // ============================================
  // GROOMING - Grooming Plans
  // ============================================
  @Post('grooming')
  @HttpCode(HttpStatus.OK)
  async grooming(@Body() dto: GroomingPlanRequestDto, @Request() req: any) {
    return this.groomingService.analyze(dto, req.user.sub);
  }

  // ============================================
  // HEALTHHUB - Health Analysis
  // ============================================
  @Post('healthhub')
  @HttpCode(HttpStatus.OK)
  async healthhub(@Body() dto: HealthhubRequestDto, @Request() req: any) {
    return this.healthhubService.analyze(dto, req.user.sub);
  }

  // ============================================
  // SOAP - Clinical Notes
  // ============================================
  @Post('soap-expand')
  @HttpCode(HttpStatus.OK)
  async soapExpand(@Body() dto: SoapExpandRequestDto, @Request() req: any) {
    return this.soapService.expand(dto, req.user.sub);
  }

  @Post('soap-undo')
  @HttpCode(HttpStatus.OK)
  async soapUndo(@Body() dto: SoapUndoRequestDto, @Request() req: any) {
    return this.soapService.undo(dto, req.user.sub);
  }
}
