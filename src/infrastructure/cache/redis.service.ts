import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private redis: Redis | null = null;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redis.url');
    const nodeEnv = this.configService.get<string>('nodeEnv');
    
    // Only connect to Redis if URL is provided
    if (redisUrl && redisUrl !== 'redis://localhost:6379') {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          connectTimeout: 5000,
        });
        
        this.redis.on('error', (err) => {
          console.warn('Redis connection error (using in-memory fallback):', err.message);
          this.redis = null;
        });

        this.redis.on('connect', () => {
          console.log('✅ Redis connected successfully');
        });
      } catch (err) {
        console.warn('Redis initialization failed (using in-memory fallback)');
        this.redis = null;
      }
    } else {
      console.log('📦 Redis not configured - using in-memory fallback (rate limiting disabled)');
    }
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.redis) return null;
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.redis) return;
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(key);
  }

  async incr(key: string): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    await this.redis.expire(key, ttlSeconds);
  }

  // Rate limiting helper
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    if (!this.redis) return { allowed: true, remaining: limit };
    
    const current = await this.incr(key);
    if (current === 1) {
      await this.expire(key, windowSeconds);
    }
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
    };
  }

  // Cache pet context
  async cachePetContext(petId: string, context: object, ttlSeconds = 300): Promise<void> {
    await this.set(`pet:context:${petId}`, JSON.stringify(context), ttlSeconds);
  }

  async getCachedPetContext(petId: string): Promise<object | null> {
    const cached = await this.get(`pet:context:${petId}`);
    return cached ? JSON.parse(cached) : null;
  }
}
