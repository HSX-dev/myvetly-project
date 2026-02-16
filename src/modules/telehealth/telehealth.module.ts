import { Module } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { TelehealthController } from './telehealth.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [TelehealthController],
  providers: [TelehealthService],
  exports: [TelehealthService],
})
export class TelehealthModule {}

