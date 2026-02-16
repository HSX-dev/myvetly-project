import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SupabaseModule } from '../supabase/supabase.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    SupabaseModule, // Import SupabaseModule to access SupabaseService
    CacheModule,     // Import CacheModule to access RedisService for caching
  ],
  providers: [AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
