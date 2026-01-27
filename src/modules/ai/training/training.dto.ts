import { IsString } from 'class-validator';

export class TrainingAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;
}

export class TrainingAnalyzeResponseDto {
  success: boolean;
  data: {
    summary: string;
    difficulty_level: 'easy' | 'medium' | 'hard';
    safety_notes: string;
    primary_behaviors: string[];
    overall_metrics: string[];
    weekly_plan: any[];
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
