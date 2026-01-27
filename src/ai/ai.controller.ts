import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';
import { HealthhubRequestDto } from './dto/healthhub.dto';
import { SoapExpandRequestDto, SoapUndoRequestDto } from './dto/soap.dto';
import { FoodScanRequestDto } from './dto/food-scan.dto';
import { PawScanRequestDto } from './dto/pawscan.dto';
import { NutritionAnalyzeRequestDto } from './dto/nutrition.dto';
import { TrainingAnalyzeRequestDto } from './dto/training.dto';
import { GroomingPlanRequestDto } from './dto/grooming.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto, @Request() req: any) {
    return this.aiService.chat(dto, req.user.sub);
  }

  @Post('healthhub')
  @HttpCode(HttpStatus.OK)
  async analyzeHealth(@Body() dto: HealthhubRequestDto, @Request() req: any) {
    return this.aiService.analyzeHealth(dto, req.user.sub);
  }

  @Post('soap-expand')
  @HttpCode(HttpStatus.OK)
  async expandSoap(@Body() dto: SoapExpandRequestDto, @Request() req: any) {
    return this.aiService.expandSoap(dto, req.user.sub);
  }

  @Post('soap-undo')
  @HttpCode(HttpStatus.OK)
  async undoSoap(@Body() dto: SoapUndoRequestDto, @Request() req: any) {
    // TODO: Implement undo functionality
    return { success: true, message: 'Undo applied' };
  }

  // ============================================
  // NEW AI ENDPOINTS - Migrated from Supabase Edge Functions
  // ============================================

  @Post('food-scan')
  @HttpCode(HttpStatus.OK)
  async analyzeFoodScan(@Body() dto: FoodScanRequestDto, @Request() req: any) {
    return this.aiService.analyzeFoodScan(dto, req.user.sub);
  }

  @Post('pawscan')
  @HttpCode(HttpStatus.OK)
  async analyzePawScan(@Body() dto: PawScanRequestDto, @Request() req: any) {
    return this.aiService.analyzePawScan(dto, req.user.sub);
  }

  @Post('nutrition')
  @HttpCode(HttpStatus.OK)
  async analyzeNutrition(@Body() dto: NutritionAnalyzeRequestDto, @Request() req: any) {
    return this.aiService.analyzeNutrition(dto, req.user.sub);
  }

  @Post('training')
  @HttpCode(HttpStatus.OK)
  async analyzeTraining(@Body() dto: TrainingAnalyzeRequestDto, @Request() req: any) {
    return this.aiService.analyzeTraining(dto, req.user.sub);
  }

  @Post('grooming')
  @HttpCode(HttpStatus.OK)
  async analyzeGrooming(@Body() dto: GroomingPlanRequestDto, @Request() req: any) {
    return this.aiService.analyzeGrooming(dto, req.user.sub);
  }
}
