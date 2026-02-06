import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

// ============================================
// Request Types
// ============================================

export type HealthHubMode =
  | 'risk_assessment'
  | 'early_warnings'
  | 'care_recommendations'
  | 'full';

export class HealthhubRequestDto {
  @IsString()
  pet_id: string;

  @IsOptional()
  @IsEnum(['risk_assessment', 'early_warnings', 'care_recommendations', 'full'])
  mode?: HealthHubMode;

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}

// ============================================
// Risk Assessment Types
// ============================================

export type RiskFactorCategory =
  | 'breed_specific'
  | 'age_related'
  | 'lifestyle'
  | 'medical_history'
  | 'weight'
  | 'preventive_care'
  | 'pawscan_patterns';

export interface RiskFactor {
  category: RiskFactorCategory;
  label: string;
  risk_level: 'low' | 'medium' | 'high';
  description: string;
  evidence: string[];
  recommendation: string;
}

export interface RiskAssessmentResult {
  overall_risk_score: number; // 0-100
  overall_risk_label: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  risk_factors: RiskFactor[];
  priority_actions: string[];
  when_to_see_vet: string;
  data_gaps: string[];
  confidence: number; // 0-1
}

// ============================================
// Early Warnings Types
// ============================================

export type AlertCategory =
  | 'weight'
  | 'activity'
  | 'appetite'
  | 'vital'
  | 'symptom';

export interface HealthAlert {
  alert_title: string;
  alert_message: string;
  severity: 'info' | 'warning' | 'error';
  category: AlertCategory;
  recommended_actions: string[];
}

export interface EarlyWarningsResult {
  alerts: HealthAlert[];
}

// ============================================
// Care Recommendations Types
// ============================================

export type RecommendationCategory = 'personalized' | 'preventive' | 'seasonal';

export interface CareRecommendation {
  category: RecommendationCategory;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CareRecommendationsResult {
  recommendations: CareRecommendation[];
}

// ============================================
// Response Types
// ============================================

export class HealthhubResponseDto {
  pet_id: string;
  mode: HealthHubMode;
  risk_assessment?: RiskAssessmentResult;
  early_warnings?: EarlyWarningsResult;
  care_recommendations?: CareRecommendationsResult;
  generated_at: string;
  cached?: boolean;
}

// ============================================
// Legacy Response (for backward compatibility)
// ============================================

export interface LegacyHealthAnalysis {
  health_score: number;
  risk_level: 'low' | 'medium' | 'high';
  key_findings: string[];
  recommendations: string[];
  upcoming_care: string[];
  lifestyle_tips: string[];
}
