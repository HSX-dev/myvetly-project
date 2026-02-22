import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import {
  HealthhubRequestDto,
  HealthhubResponseDto,
  HealthHubMode,
  RiskAssessmentResult,
  EarlyWarningsResult,
  CareRecommendationsResult,
} from './healthhub.dto';

@Injectable()
export class HealthhubService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async analyze(
    dto: HealthhubRequestDto,
    userId: string,
  ): Promise<HealthhubResponseDto> {
    const startTime = Date.now();
    const mode: HealthHubMode = dto.mode || 'full';

    await this.checkRateLimit(
      `rate:healthhub:${userId}`,
      RATE_LIMITS.HEALTHHUB.maxRequests,
      RATE_LIMITS.HEALTHHUB.windowSeconds,
    );

    // Check cache unless force refresh
    const cacheKey = `healthhub:${dto.pet_id}:${mode}`;
    if (!dto.force_refresh) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    }

    // Fetch all required data in parallel
    const [
      pet,
      records,
      appointments,
      pawscanHistory,
      vitalHistory,
      vaccineStatus,
      preventiveCareGaps,
    ] = await Promise.all([
      this.supabaseService.getPetContext(dto.pet_id),
      this.supabaseService.getPetMedicalRecords(dto.pet_id, 10),
      this.supabaseService.getPetAppointments(dto.pet_id, 5),
      this.supabaseService.getPawScanHistory(dto.pet_id, 10),
      this.supabaseService.getVitalHistory(dto.pet_id, 14),
      this.supabaseService.getVaccineStatus(dto.pet_id),
      this.supabaseService.getPreventiveCareGaps(dto.pet_id),
    ]);

    if (!pet) {
      throw new Error('Pet not found');
    }

    // Build response based on mode
    const result: HealthhubResponseDto = {
      pet_id: dto.pet_id,
      mode,
      generated_at: new Date().toISOString(),
    };

    // Execute analysis based on mode
    if (mode === 'full') {
      // Run all 3 analyses in parallel for full mode
      const [riskAssessment, earlyWarnings, careRecommendations] =
        await Promise.all([
          this.analyzeRiskAssessment(
            pet,
            records,
            pawscanHistory,
            vitalHistory,
            vaccineStatus,
            preventiveCareGaps,
          ),
          this.analyzeEarlyWarnings(pet, vitalHistory, pawscanHistory),
          this.analyzeCareRecommendations(pet, vitalHistory, pawscanHistory),
        ]);

      result.risk_assessment = riskAssessment;
      result.early_warnings = earlyWarnings;
      result.care_recommendations = careRecommendations;
    } else if (mode === 'risk_assessment') {
      result.risk_assessment = await this.analyzeRiskAssessment(
        pet,
        records,
        pawscanHistory,
        vitalHistory,
        vaccineStatus,
        preventiveCareGaps,
      );
    } else if (mode === 'early_warnings') {
      result.early_warnings = await this.analyzeEarlyWarnings(
        pet,
        vitalHistory,
        pawscanHistory,
      );
    } else if (mode === 'care_recommendations') {
      result.care_recommendations = await this.analyzeCareRecommendations(
        pet,
        vitalHistory,
        pawscanHistory,
      );
    }

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(result), 300);

    this.logTiming('Healthhub analyze', startTime, { mode });

    return result;
  }

  // ============================================
  // Risk Assessment Analysis
  // ============================================

  private async analyzeRiskAssessment(
    pet: any,
    records: any[],
    pawscanHistory: any[],
    vitalHistory: any,
    vaccineStatus: any,
    preventiveCareGaps: any,
  ): Promise<RiskAssessmentResult> {
    const summaryJson = this.buildRiskAssessmentSummary(
      pet,
      records,
      pawscanHistory,
      vitalHistory,
      vaccineStatus,
      preventiveCareGaps,
    );

    const response = await this.callOpenAI(
      AI_PROMPTS.HEALTHHUB_RISK_ASSESSMENT,
      `RISK ASSESSMENT REQUEST\n\nPET HEALTH SUMMARY:\n${summaryJson}\n\nAnalyze this data and return the risk assessment JSON.`,
      { temperature: 0.5, maxTokens: 1500 },
    );

    return this.parseJsonResponse<RiskAssessmentResult>(response.content);
  }

  private buildRiskAssessmentSummary(
    pet: any,
    records: any[],
    pawscanHistory: any[],
    vitalHistory: any,
    vaccineStatus: any,
    preventiveCareGaps: any,
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const ageInYears = pet.birth_date ? this.calculateAgeInYears(pet.birth_date) : null;

    // Determine life stage
    let lifeStage = 'adult';
    if (ageInYears !== null) {
      if (pet.species === 'cat') {
        if (ageInYears < 1) lifeStage = 'kitten';
        else if (ageInYears < 7) lifeStage = 'adult';
        else if (ageInYears < 11) lifeStage = 'mature';
        else lifeStage = 'senior';
      } else {
        // Dogs - size matters for senior threshold
        const isLargeBreed = this.isLargeBreed(pet.breed);
        if (ageInYears < 1) lifeStage = 'puppy';
        else if (ageInYears < 2) lifeStage = 'young_adult';
        else if (isLargeBreed && ageInYears >= 6) lifeStage = 'senior';
        else if (!isLargeBreed && ageInYears >= 8) lifeStage = 'senior';
        else if (ageInYears >= 5) lifeStage = 'mature';
        else lifeStage = 'adult';
      }
    }

    // Analyze PawScan patterns - focus on RECURRING issues
    const diagnosisCounts: Record<string, { count: number; dates: string[]; treated: boolean }> = {};
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    pawscanHistory.forEach((s) => {
      if (s.diagnosis) {
        const key = s.diagnosis.toLowerCase().substring(0, 50);
        if (!diagnosisCounts[key]) {
          diagnosisCounts[key] = { count: 0, dates: [], treated: false };
        }
        diagnosisCounts[key].count++;
        diagnosisCounts[key].dates.push(s.created_at);
        // Check if treated (has recommendations or follow-up)
        if (s.recommendations || s.treatment_guide) {
          diagnosisCounts[key].treated = true;
        }
      }
    });

    // Identify recurring issues (3+ occurrences in 60 days)
    const recurringIssues = Object.entries(diagnosisCounts)
      .filter(([, data]) => {
        const recentOccurrences = data.dates.filter(d => new Date(d) >= sixtyDaysAgo).length;
        return recentOccurrences >= 3;
      })
      .map(([issue, data]) => ({
        issue,
        occurrences: data.count,
        treated: data.treated,
        frequency: data.count >= 4 ? 'frequent' : 'recurring',
      }));

    // One-time issues (treated and not recurring)
    const oneTimeIssues = Object.entries(diagnosisCounts)
      .filter(([, data]) => data.count === 1 && data.treated)
      .map(([issue]) => issue);

    // Analyze weight trend
    const weightLogs = vitalHistory.weightLogs || [];
    let weightTrend = 'stable';
    let weightChangePercent = 0;
    if (weightLogs.length >= 2) {
      const latest = weightLogs[0]?.weight || 0;
      const oldest = weightLogs[weightLogs.length - 1]?.weight || 0;
      if (oldest > 0) {
        weightChangePercent = ((latest - oldest) / oldest) * 100;
        if (weightChangePercent > 10) weightTrend = 'significant_gain';
        else if (weightChangePercent > 5) weightTrend = 'gaining';
        else if (weightChangePercent < -10) weightTrend = 'significant_loss';
        else if (weightChangePercent < -5) weightTrend = 'losing';
      }
    }

    // Analyze activity trend
    const activityLogs = vitalHistory.activityLogs || [];
    const avgActivity =
      activityLogs.length > 0
        ? activityLogs.reduce((sum: number, a: any) => sum + (a.activity_level || 0), 0) /
          activityLogs.length
        : null;

    // Check for chronic conditions in medical records
    const chronicConditions = records.filter((r) => 
      r.record_type === 'diagnosis' || 
      r.notes?.toLowerCase().includes('chronic') ||
      r.notes?.toLowerCase().includes('ongoing') ||
      r.notes?.toLowerCase().includes('diabetes') ||
      r.notes?.toLowerCase().includes('heart disease') ||
      r.notes?.toLowerCase().includes('kidney') ||
      r.notes?.toLowerCase().includes('arthritis')
    );

    return JSON.stringify(
      {
        petProfile: {
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          age,
          ageInYears,
          lifeStage,
          sex: pet.sex,
          weight: pet.weight,
          allergies: pet.allergies || 'None',
          medicalConditions: pet.medical_conditions || 'None reported',
        },
        ageAndBreedContext: {
          lifeStage,
          ageInYears,
          breedSize: this.isLargeBreed(pet.breed) ? 'large' : 'small_medium',
          note: 'Age and breed predispositions should be the PRIMARY factor in risk scoring. Young healthy pets should have LOW scores.',
        },
        breedSpeciesRisksToWatch: {
          species: pet.species,
          breed: pet.breed,
          sizeCategory: this.isLargeBreed(pet.breed) ? 'large' : 'small_medium',
          guidance: 'Always output 2-4 breed_specific risk_factors for "risks to watch for" for this breed/species. Small dogs: diabetes, heart murmurs, dental, patella. Large dogs: hip dysplasia, bloat, arthritis. Cats: kidney, thyroid, dental, heart (HCM). Add breed-specific items (e.g. Cavalier heart, Golden hip/cancer, Bulldog respiratory).',
        },
        chronicConditions: {
          hasChronicConditions: chronicConditions.length > 0,
          conditions: chronicConditions.slice(0, 3).map((r) => ({
            type: r.record_type,
            notes: r.notes?.substring(0, 100),
            date: r.created_at,
          })),
        },
        medicalHistorySummary: chronicConditions.length > 0
          ? `Reported: ${chronicConditions.slice(0, 3).map((r) => r.notes || r.record_type).join('; ').substring(0, 200)}`
          : 'None reported. Always include a medical_history risk_factor stating "No significant medical history reported" with risk_level low.',
        pawscanPatternsSummary: recurringIssues.length > 0
          ? `Recurring (3+ in 60 days): ${recurringIssues.map((u) => u.issue).join('; ')}. One-time treated: ${oneTimeIssues.length}.`
          : `No recurring patterns (${pawscanHistory.length} scan(s) in history). Always include a pawscan_patterns risk_factor stating "No recurring PawScan issues" with risk_level low.`,
        weight: {
          current: pet.weight,
          trend: weightTrend,
          changePercent: weightChangePercent.toFixed(1),
          logsCount: weightLogs.length,
        },
        activity: {
          averageLevel: avgActivity,
          logsCount: activityLogs.length,
        },
        vaccines: {
          overdueCount: vaccineStatus.overdue?.length || 0,
          dueSoonCount: vaccineStatus.dueSoon?.length || 0,
          overdueItems: vaccineStatus.overdue?.map((v: any) => v.vaccine_name) || [],
        },
        pawscanAnalysis: {
          totalScans: pawscanHistory.length,
          recurringIssues,
          oneTimeIssuesTreated: oneTimeIssues.length,
          note: 'One-time treated issues should NOT significantly impact risk score. Only RECURRING patterns matter.',
        },
        preventiveCareGaps: {
          heartworm: preventiveCareGaps.heartworm,
          fleaTick: preventiveCareGaps.fleaTick,
        },
        scoringGuidance: {
          youngHealthyPet: 'If pet is young (under 3 years) with no chronic conditions or recurring issues, score should be 10-25 max.',
          seniorPet: 'Senior pets naturally have higher base scores (30-50) due to age-related risks.',
          breedRisks: 'Add points for known breed predispositions that become more relevant with age.',
          pawscansNote: 'PawScans alone do NOT indicate high risk. Only recurring untreated patterns add significant points.',
        },
      },
      null,
      2,
    );
  }

  private calculateAgeInYears(birthDate: string): number {
    const birth = new Date(birthDate);
    const now = new Date();
    const years = (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(years * 10) / 10; // One decimal place
  }

  private isLargeBreed(breed: string): boolean {
    if (!breed) return false;
    const largeBreeds = [
      'german shepherd', 'golden retriever', 'labrador', 'rottweiler', 
      'great dane', 'mastiff', 'saint bernard', 'bernese', 'newfoundland',
      'irish wolfhound', 'great pyrenees', 'doberman', 'boxer', 'husky',
      'malamute', 'akita', 'weimaraner', 'rhodesian', 'cane corso',
      'bullmastiff', 'leonberger', 'irish setter', 'gordon setter',
      'belgian malinois', 'belgian shepherd', 'collie', 'old english sheepdog'
    ];
    const breedLower = breed.toLowerCase();
    return largeBreeds.some(lb => breedLower.includes(lb));
  }

  // ============================================
  // Early Warnings Analysis
  // ============================================

  private async analyzeEarlyWarnings(
    pet: any,
    vitalHistory: any,
    pawscanHistory: any[],
  ): Promise<EarlyWarningsResult> {
    const summaryJson = this.buildEarlyWarningsSummary(
      pet,
      vitalHistory,
      pawscanHistory,
    );

    const response = await this.callOpenAI(
      AI_PROMPTS.HEALTHHUB_EARLY_WARNINGS,
      `EARLY WARNINGS ANALYSIS REQUEST\n\nVITAL TRENDS DATA:\n${summaryJson}\n\nAnalyze for concerning trends and return the alerts JSON. If everything looks normal, return an empty alerts array.`,
      { temperature: 0.4, maxTokens: 1000 },
    );

    return this.parseJsonResponse<EarlyWarningsResult>(response.content);
  }

  private buildEarlyWarningsSummary(
    pet: any,
    vitalHistory: any,
    pawscanHistory: any[],
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const weightLogs = vitalHistory.weightLogs || [];
    const activityLogs = vitalHistory.activityLogs || [];

    // Calculate weight change
    let weightChange: number | null = null;
    if (weightLogs.length >= 2) {
      const latest = weightLogs[0]?.weight || 0;
      const oldest = weightLogs[weightLogs.length - 1]?.weight || 0;
      if (oldest > 0) {
        weightChange = ((latest - oldest) / oldest) * 100;
      }
    }

    // Calculate activity trend
    let activityTrend = 'stable';
    if (activityLogs.length >= 3) {
      const recentAvg =
        activityLogs.slice(0, 3).reduce((s: number, a: any) => s + (a.activity_level || 0), 0) / 3;
      const olderAvg =
        activityLogs.slice(-3).reduce((s: number, a: any) => s + (a.activity_level || 0), 0) / 3;
      if (olderAvg > 0) {
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        if (change < -20) activityTrend = 'declining';
        else if (change > 20) activityTrend = 'increasing';
      }
    }

    // Recent symptoms from PawScan
    const recentSymptoms = pawscanHistory.slice(0, 5).map((s) => ({
      date: s.created_at,
      severity: s.severity_label,
      diagnosis: s.diagnosis,
    }));

    return JSON.stringify(
      {
        petProfile: {
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          age,
          currentWeight: pet.weight,
        },
        vitalTrends: {
          weightLogs: weightLogs.slice(0, 7).map((w: any) => ({
            weight: w.weight,
            date: w.recorded_at,
          })),
          weightChangePercent: weightChange?.toFixed(2) || null,
          activityLogs: activityLogs.slice(0, 7).map((a: any) => ({
            level: a.activity_level,
            date: a.recorded_at,
          })),
          activityTrend,
        },
        recentSymptoms,
        analysisWindow: '14 days',
      },
      null,
      2,
    );
  }

  // ============================================
  // Care Recommendations Analysis
  // ============================================

  private async analyzeCareRecommendations(
    pet: any,
    vitalHistory: any,
    pawscanHistory: any[],
  ): Promise<CareRecommendationsResult> {
    const summaryJson = this.buildCareRecommendationsSummary(
      pet,
      vitalHistory,
      pawscanHistory,
    );

    const response = await this.callOpenAI(
      AI_PROMPTS.HEALTHHUB_CARE_RECOMMENDATIONS,
      `CARE RECOMMENDATIONS REQUEST\n\nPET PROFILE AND HISTORY:\n${summaryJson}\n\nProvide personalized, preventive, and seasonal care recommendations. Return JSON only.`,
      { temperature: 0.6, maxTokens: 1200 },
    );

    return this.parseJsonResponse<CareRecommendationsResult>(response.content);
  }

  private buildCareRecommendationsSummary(
    pet: any,
    vitalHistory: any,
    pawscanHistory: any[],
  ): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const activityLogs = vitalHistory.activityLogs || [];
    const weightLogs = vitalHistory.weightLogs || [];

    // Get current season
    const season = this.getCurrentSeason();

    // Analyze recurring issues from PawScan
    const diagnosisCount: Record<string, number> = {};
    pawscanHistory.forEach((s) => {
      if (s.diagnosis) {
        const key = s.diagnosis.toLowerCase().substring(0, 50);
        diagnosisCount[key] = (diagnosisCount[key] || 0) + 1;
      }
    });
    const recurringIssues = Object.entries(diagnosisCount)
      .filter(([, count]) => count >= 2)
      .map(([issue, count]) => ({ issue, count }));

    // Calculate average activity
    const avgActivity =
      activityLogs.length > 0
        ? activityLogs.reduce((s: number, a: any) => s + (a.activity_level || 0), 0) /
          activityLogs.length
        : null;

    // Weight trend
    let weightTrend = 'stable';
    if (weightLogs.length >= 2) {
      const latest = weightLogs[0]?.weight || 0;
      const oldest = weightLogs[weightLogs.length - 1]?.weight || 0;
      if (oldest > 0) {
        const change = ((latest - oldest) / oldest) * 100;
        if (change > 5) weightTrend = 'gaining';
        else if (change < -5) weightTrend = 'losing';
      }
    }

    return JSON.stringify(
      {
        petProfile: {
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          age,
          weight: pet.weight,
          sex: pet.sex,
          allergies: pet.allergies || 'None',
        },
        currentSeason: season,
        activityLevel: {
          average: avgActivity,
          trend: avgActivity
            ? avgActivity > 7
              ? 'high'
              : avgActivity > 4
                ? 'moderate'
                : 'low'
            : 'unknown',
        },
        weightTrend,
        pawscanHistory: {
          totalScans: pawscanHistory.length,
          recurringIssues,
          recentScans: pawscanHistory.slice(0, 3).map((s) => ({
            date: s.created_at,
            severity: s.severity_label,
            diagnosis: s.diagnosis?.substring(0, 100),
            recommendations: s.recommendations,
          })),
        },
      },
      null,
      2,
    );
  }

  // ============================================
  // Helper Methods
  // ============================================

  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }
}
