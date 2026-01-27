import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class HealthhubRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}

export class HealthhubResponseDto {
  pet_id: string;
  analysis: {
    health_score: number;
    risk_level: 'low' | 'medium' | 'high';
    key_findings: string[];
    recommendations: string[];
    upcoming_care: string[];
    lifestyle_tips: string[];
  };
  generated_at: string;
  cached?: boolean;
}
