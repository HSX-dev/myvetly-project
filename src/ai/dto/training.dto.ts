import { IsString } from 'class-validator';

export class TrainingAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;
}

export interface DailySession {
  day_label: string;
  exercise_name: string;
  steps: string[];
  estimated_time_minutes: number;
  tracking_metrics: string[];
}

export interface WeeklyPlan {
  week_number: number;
  focus: string;
  daily_sessions: DailySession[];
}

export class TrainingAnalyzeResponseDto {
  success: boolean;
  data: {
    summary: string;
    difficulty_level: 'easy' | 'medium' | 'hard';
    safety_notes: string;
    primary_behaviors: string[];
    overall_metrics: string[];
    weekly_plan: WeeklyPlan[];
  };
  latency_ms: number;
  cost_usd: number;
  model: string;
}
