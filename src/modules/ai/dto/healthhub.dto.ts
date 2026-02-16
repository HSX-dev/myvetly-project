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
  risk_level: 'low' | 'medium' | 'high';
  overall_score: number;
  categories: {
    name: string;
    score: number;
    status: string;
    recommendations: string[];
  }[];
  summary: string;
  generated_at: string;
}
