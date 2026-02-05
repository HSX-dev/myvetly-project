import { IsString, IsOptional, IsArray, IsObject, IsEnum } from 'class-validator';

export class PawScanRequestDto {
  @IsOptional()
  @IsEnum(['analyze', 'follow_up', 'generate_treatment'])
  mode?: 'analyze' | 'follow_up' | 'generate_treatment';

  @IsOptional()
  @IsString()
  pet_id?: string;

  @IsOptional()
  @IsObject()
  answers?: {
    complaint?: string;
    symptoms?: string;
    when_started?: string;
    duration?: string;
    category?: string;
    appetite?: string;
    water_intake?: string;
    energy_level?: string;
    digestive_issues?: string;
    medications?: string;
    getting_worse?: boolean;
    other_symptoms?: string[];
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsObject()
  follow_up_answers?: Record<string, string>;
}

export interface TreatmentGuide {
  medications: { name: string; description: string }[];
  natural_remedies: { remedy: string; description: string }[];
  dietary_recommendations: string[];
  preventive_measures: string[];
  lifestyle_modifications: string[];
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  options?: string[];
}

// Response when follow-up questions are needed
export class PawScanFollowUpRequiredDto {
  session_id: string;
  phase: 'follow_up_required';
  preliminary_assessment: string;
  follow_up_questions: FollowUpQuestion[];
  confidence_score: number;
  model_used: string;
  latency_ms: number;
}

// Response with complete analysis (no follow-up needed or after follow-up)
export class PawScanResponseDto {
  session_id: string;
  phase?: 'completed';
  severity_score: number;
  severity_label: 'low' | 'medium' | 'high' | 'critical';
  vet_action: 'monitor' | 'see_vet' | 'urgent_care';
  triage: string;
  diagnosis: string;
  prognosis: string;
  recommendations: string[];
  treatment_guide: TreatmentGuide | null;
  risk_flags: string[];
  confidence_score: number;
  model_used: string;
  latency_ms: number;
  cost_usd: number;
}

// Union type for analyze responses
export type PawScanAnalyzeResponse = PawScanResponseDto | PawScanFollowUpRequiredDto;

export class PawScanTreatmentResponseDto {
  treatment_guide: TreatmentGuide;
  latency_ms?: number;
  cost_usd?: number;
  model_used?: string;
  cached?: boolean;
}
