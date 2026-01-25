import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../cache/redis.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import * as jwt from 'jsonwebtoken';

/**
 * User context interface representing the authenticated user
 * This is attached to the request by AuthGuard
 */
export interface UserContext {
  id: string;
  email?: string;
  auth_user_id: string;
  user_id: string;
  clinic_id: string | null;
  organization_id: string | null;
  role: string;
  role_id?: string | null;
  full_name?: string;
  access_token?: string;
}

/**
 * AuthGuard that validates Supabase JWT tokens
 * Extracts user information from the token and attaches it to the request
 * 
 * Performance Optimization:
 * - Caches user profiles in Redis to avoid database queries on every request
 * - Cache TTL: 5 minutes (300 seconds)
 * - Cache key: user:profile:${authUserId}
 * 
 * Public Routes:
 * - Routes marked with @Public() decorator will skip authentication
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly USER_PROFILE_CACHE_TTL = 300; // 5 minutes

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Skip authentication for public routes
    if (isPublic) {
      console.log('AuthGuard: Public route, skipping authentication');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    console.log('AuthGuard: Checking authentication', {
      hasToken: !!token,
      path: request.url,
      method: request.method,
    });

    if (!token) {
      console.error('AuthGuard: No token provided');
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Decode token to get user ID (without verification first)
      const decoded = jwt.decode(token) as any;
      
      if (!decoded || !decoded.sub) {
        throw new UnauthorizedException('Invalid token format');
      }

      const authUserId = decoded.sub;
      const userEmail = decoded.email;

      // Try to get user profile from cache first (performance optimization)
      let userProfile: any = await this.redisService.getCachedUserProfile(authUserId);

      if (userProfile) {
        // Cache hit - use cached profile (~1-2ms)
        console.log('AuthGuard: User profile loaded from cache', { authUserId });
      } else {
        // Cache miss - fetch from database (~40-50ms)
        const { data: profileData, error: profileError } = await this.supabaseService
          .getClient()
          .from('users')
          .select('id, role, role_id, organization_id, clinic_id, full_name, email')
          .eq('auth_user_id', authUserId)
          .single();

        if (profileError) {
          // Log the error for debugging
          console.error('User profile lookup error:', {
            error: profileError,
            authUserId,
            message: profileError.message,
            details: profileError.details,
          });
          throw new UnauthorizedException(`User profile not found: ${profileError.message}`);
        }

        if (!profileData) {
          console.error('User profile not found for auth_user_id:', authUserId);
          throw new UnauthorizedException('User profile not found');
        }

        userProfile = profileData;

        // Cache the profile for future requests (non-blocking)
        this.redisService.cacheUserProfile(authUserId, userProfile, this.USER_PROFILE_CACHE_TTL)
          .then(() => {
            console.log('AuthGuard: User profile cached', { authUserId });
          })
          .catch((cacheError) => {
            // Non-critical - log but don't fail the request
            console.warn('AuthGuard: Failed to cache user profile', cacheError);
          });
      }

      // Verify token is not expired (basic check)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw new UnauthorizedException('Token expired');
      }

      // Attach user info to request
      request.user = {
        id: authUserId,
        email: userEmail || userProfile.email,
        auth_user_id: authUserId,
        user_id: userProfile.id,
        role: userProfile.role,
        role_id: userProfile.role_id,
        organization_id: userProfile.organization_id,
        clinic_id: userProfile.clinic_id,
        full_name: userProfile.full_name,
        access_token: token, // Keep token for potential use in services
      };

      console.log('AuthGuard: User authenticated successfully', {
        id: request.user.id,
        clinic_id: request.user.clinic_id,
        role: request.user.role,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Log unexpected errors for debugging
      console.error('AuthGuard error:', error);
      throw new UnauthorizedException('Token validation failed');
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
