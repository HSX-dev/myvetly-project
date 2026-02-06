import { IsString, IsOptional } from 'class-validator';

// ============================================
// Request Types
// ============================================

export class TrainingAnalyzeRequestDto {
  @IsString()
  pet_id: string;

  @IsString()
  preference_id: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// ============================================
// Experience & Difficulty Types
// ============================================

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

// ============================================
// Session & Plan Types
// ============================================

export interface DailySession {
  day_label: string; // "Session 1", "Session 2", etc.
  exercise_name: string;
  steps: string[];
  estimated_time_minutes: number;
  tracking_metrics: string[];
}

export interface WeeklyPlan {
  week_number: number; // 1-4
  focus: string;
  daily_sessions: DailySession[];
}

// ============================================
// Training Plan Result
// ============================================

export interface TrainingPlanResult {
  summary: string;
  difficulty_level: DifficultyLevel;
  safety_notes: string;
  primary_behaviors: string[];
  overall_metrics: string[];
  weekly_plan: WeeklyPlan[];
}

// ============================================
// Response Types
// ============================================

export class TrainingAnalyzeResponseDto {
  success: boolean;
  data: TrainingPlanResult;
  latency_ms: number;
  cost_usd: number;
  model: string;
}

// ============================================
// Training Preferences (from DB)
// ============================================

export interface TrainingPreferences {
  id: string;
  pet_id: string;
  behavior_issues: string[];
  training_goals: string[];
  experience_level: ExperienceLevel;
  time_commitment_minutes: number;
  specific_behaviors?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// Experience Level Mapping
// ============================================

export const EXPERIENCE_LEVEL_MAP: Record<ExperienceLevel, string> = {
  beginner: 'Beginner (new to training)',
  intermediate: 'Intermediate (some training experience)',
  advanced: 'Advanced (experienced trainer)',
};
