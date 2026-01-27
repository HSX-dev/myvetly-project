import { IsString, IsOptional, IsArray, IsObject, IsEnum } from 'class-validator';

export class PawScanRequestDto {
  @IsOptional()
  @IsEnum(['analyze', 'generate_treatment'])
  mode?: 'analyze' | 'generate_treatment';

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
}

export interface TreatmentGuide {
  medications: { name: string; description: string }[];
  natural_remedies: { remedy: string; description: string }[];
  dietary_recommendations: string[];
  preventive_measures: string[];
  lifestyle_modifications: string[];
}

export class PawScanResponseDto {
  session_id: string;
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

export class PawScanTreatmentResponseDto {
  treatment_guide: TreatmentGuide;
  latency_ms?: number;
  cost_usd?: number;
  model_used?: string;
  cached?: boolean;
}
