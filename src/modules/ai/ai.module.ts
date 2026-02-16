import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DeepseekProvider } from './providers/deepseek.provider';
import { OpenaiProvider } from './providers/openai.provider';

@Module({
  controllers: [AiController],
  providers: [AiService, DeepseekProvider, OpenaiProvider],
  exports: [AiService],
})
export class AiModule {}
