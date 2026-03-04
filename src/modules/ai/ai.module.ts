import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';

// Services
import { ChatService } from './chat/chat.service';
import { PawscanService } from './pawscan/pawscan.service';
import { FoodScanService } from './food-scan/food-scan.service';
import { NutritionService } from './nutrition/nutrition.service';
import { TrainingService } from './training/training.service';
import { GroomingService } from './grooming/grooming.service';
import { HealthhubService } from './healthhub/healthhub.service';
import { SoapService } from './soap/soap.service';

// Infrastructure
import { OpenaiProvider, DeepseekProvider, GeminiProvider } from '../../infrastructure/ai-providers';

// Shared modules
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module';
import { CacheModule } from '../../infrastructure/cache/cache.module';

@Module({
  imports: [SupabaseModule, CacheModule],
  controllers: [AiController],
  providers: [
    // AI Providers
    OpenaiProvider,
    DeepseekProvider,
    GeminiProvider,
    // Domain Services
    ChatService,
    PawscanService,
    FoodScanService,
    NutritionService,
    TrainingService,
    GroomingService,
    HealthhubService,
    SoapService,
  ],
  exports: [
    ChatService,
    PawscanService,
    FoodScanService,
    NutritionService,
    TrainingService,
    GroomingService,
    HealthhubService,
    SoapService,
  ],
})
export class AiModule {}
