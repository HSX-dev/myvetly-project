import { Module } from '@nestjs/common';
import { SoapController } from './soap.controller';
import { SoapService } from './soap.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [SupabaseModule, AiModule],
  controllers: [SoapController],
  providers: [SoapService],
  exports: [SoapService],
})
export class SoapModule {}






