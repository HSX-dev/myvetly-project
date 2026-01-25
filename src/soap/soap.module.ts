import { Module } from '@nestjs/common';
import { SoapController } from './soap.controller';
import { SoapService } from './soap.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [SoapController],
  providers: [SoapService],
  exports: [SoapService],
})
export class SoapModule {}

