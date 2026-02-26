import { IsString, IsOptional, IsUUID } from 'class-validator';

export class LogAuthEventDto {
  @IsString()
  action: string; // 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE'

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  details?: Record<string, any>;
}
