import { Module } from '@nestjs/common';
import { WhiteboardService } from './whiteboard.service';
import { WhiteboardController } from './whiteboard.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService],
  exports: [WhiteboardService],
})
export class WhiteboardModule {}


