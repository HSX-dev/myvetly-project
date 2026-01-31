import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NotFoundException, DatabaseException } from '../../common/exceptions';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('supabase.url') || '';
    const supabaseKey = this.configService.get<string>('supabase.serviceKey') || '';
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Service Key must be configured');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to get pet data with context
  async getPetContext(petId: string) {
    try {
      const { data: pet, error } = await this.supabase
        .from('pets')
        .select(`
          *,
          clients!client_id (
            id,
            user_id,
            users!user_id (
              id,
              email,
              full_name
            )
          )
        `)
        .eq('id', petId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Pet', petId);
        }
        this.logger.error(`Failed to fetch pet context: ${error.message}`);
        throw new DatabaseException('fetch pet context', error.message);
      }
      return pet;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof DatabaseException) {
        throw err;
      }
      this.logger.error(`Unexpected error fetching pet: ${err}`);
      throw new DatabaseException('fetch pet context');
    }
  }

  // Helper method to get pet medical records
  async getPetMedicalRecords(petId: string, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('medical_records')
        .select('*')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`Medical records query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching medical records: ${err}`);
      return [];
    }
  }

  // Helper method to get pet appointments
  async getPetAppointments(petId: string, limit = 5) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select('*')
        .eq('pet_id', petId)
        .order('appointment_time', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`Appointments query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching appointments: ${err}`);
      return [];
    }
  }

  // Helper method to get pet vaccinations
  async getPetVaccinations(petId: string) {
    try {
      const { data, error } = await this.supabase
        .from('vaccinations')
        .select('*')
        .eq('pet_id', petId)
        .order('date_administered', { ascending: false });

      if (error) {
        // Table might not exist - return empty array
        console.warn('Vaccinations query failed:', error.message);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }

  // Helper method to get pet medications
  async getPetMedications(petId: string) {
    try {
      const { data, error } = await this.supabase
        .from('medications')
        .select('*')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist - return empty array
        console.warn('Medications query failed:', error.message);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }

  // ============================================
  // HealthHub Data Methods
  // ============================================

  /**
   * Get PawScan history for a pet
   * Used for identifying recurring symptoms and patterns
   */
  async getPawScanHistory(petId: string, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('pawscan_sessions')
        .select(
          'id, severity_score, severity_label, vet_action, diagnosis, recommendations, risk_flags, created_at',
        )
        .eq('pet_id', petId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`PawScan history query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching PawScan history: ${err}`);
      return [];
    }
  }

  /**
   * Get vital history (weight and activity logs) for a pet
   * Used for trend analysis in early warnings
   */
  async getVitalHistory(petId: string, days = 14) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Try to get weight logs
      const { data: weightLogs, error: weightError } = await this.supabase
        .from('weight_logs')
        .select('weight, recorded_at')
        .eq('pet_id', petId)
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: false });

      if (weightError) {
        this.logger.warn(`Weight logs query failed: ${weightError.message}`);
      }

      // Try to get activity logs
      const { data: activityLogs, error: activityError } = await this.supabase
        .from('activity_logs')
        .select('activity_level, recorded_at')
        .eq('pet_id', petId)
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: false });

      if (activityError) {
        this.logger.warn(`Activity logs query failed: ${activityError.message}`);
      }

      return {
        weightLogs: weightLogs || [],
        activityLogs: activityLogs || [],
      };
    } catch (err) {
      this.logger.error(`Unexpected error fetching vital history: ${err}`);
      return { weightLogs: [], activityLogs: [] };
    }
  }

  /**
   * Get vaccine status for a pet
   * Returns overdue and due soon vaccines
   */
  async getVaccineStatus(petId: string) {
    try {
      const { data, error } = await this.supabase
        .from('vaccinations')
        .select('vaccine_name, date_administered, next_due_date')
        .eq('pet_id', petId)
        .order('next_due_date', { ascending: true });

      if (error) {
        this.logger.warn(`Vaccine status query failed: ${error.message}`);
        return { overdue: [], dueSoon: [], upToDate: [] };
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const overdue: any[] = [];
      const dueSoon: any[] = [];
      const upToDate: any[] = [];

      (data || []).forEach((vaccine) => {
        if (!vaccine.next_due_date) {
          upToDate.push(vaccine);
          return;
        }

        const dueDate = new Date(vaccine.next_due_date);
        if (dueDate < now) {
          overdue.push(vaccine);
        } else if (dueDate <= thirtyDaysFromNow) {
          dueSoon.push(vaccine);
        } else {
          upToDate.push(vaccine);
        }
      });

      return { overdue, dueSoon, upToDate };
    } catch (err) {
      this.logger.error(`Unexpected error fetching vaccine status: ${err}`);
      return { overdue: [], dueSoon: [], upToDate: [] };
    }
  }

  /**
   * Get symptom history for a pet
   * Used for pattern detection in early warnings
   */
  async getSymptomHistory(petId: string, days = 14) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await this.supabase
        .from('symptom_logs')
        .select('symptom_type, severity, notes, recorded_at')
        .eq('pet_id', petId)
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: false });

      if (error) {
        this.logger.warn(`Symptom history query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching symptom history: ${err}`);
      return [];
    }
  }

  /**
   * Get preventive care gaps for a pet
   * Checks for missing heartworm, flea/tick prevention
   */
  async getPreventiveCareGaps(petId: string) {
    try {
      // Check for recent preventive care records
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await this.supabase
        .from('preventive_care')
        .select('care_type, last_administered, next_due')
        .eq('pet_id', petId);

      if (error) {
        this.logger.warn(`Preventive care query failed: ${error.message}`);
        return { heartworm: true, fleaTick: true }; // Assume gaps if can't fetch
      }

      const gaps = {
        heartworm: true,
        fleaTick: true,
      };

      (data || []).forEach((record) => {
        const lastDate = record.last_administered
          ? new Date(record.last_administered)
          : null;
        if (lastDate && lastDate >= thirtyDaysAgo) {
          if (record.care_type === 'heartworm') gaps.heartworm = false;
          if (record.care_type === 'flea_tick') gaps.fleaTick = false;
        }
      });

      return gaps;
    } catch (err) {
      this.logger.error(`Unexpected error fetching preventive care: ${err}`);
      return { heartworm: true, fleaTick: true };
    }
  }

  // ============================================
  // Nutrition Data Methods
  // ============================================

  /**
   * Get activity level logs for a pet
   * Used for calculating average activity level for nutrition plans
   */
  async getActivityLogs(petId: string, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await this.supabase
        .from('pet_activity_level_logs')
        .select('activity_level, entry_date')
        .eq('pet_id', petId)
        .gte('entry_date', startDate.toISOString().split('T')[0])
        .order('entry_date', { ascending: false })
        .limit(days);

      if (error) {
        this.logger.warn(`Activity logs query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching activity logs: ${err}`);
      return [];
    }
  }

  /**
   * Get nutrition preferences for a pet
   */
  async getNutritionPreferences(preferenceId: string) {
    try {
      const { data, error } = await this.supabase
        .from('pet_nutrition_preferences')
        .select('*')
        .eq('id', preferenceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Nutrition preferences', preferenceId);
        }
        this.logger.error(`Failed to fetch nutrition preferences: ${error.message}`);
        throw new DatabaseException('fetch nutrition preferences', error.message);
      }
      return data;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof DatabaseException) {
        throw err;
      }
      this.logger.error(`Unexpected error fetching nutrition preferences: ${err}`);
      throw new DatabaseException('fetch nutrition preferences');
    }
  }

  /**
   * Store nutrition plan in database
   */
  async storeNutritionPlan(
    petId: string,
    preferenceId: string,
    plan: any,
    metadata: { model: string; latency_ms: number; cost_usd: number },
  ) {
    try {
      const { data, error } = await this.supabase
        .from('nutrition_plans')
        .insert({
          pet_id: petId,
          preference_id: preferenceId,
          calorie_target: plan.calorie_target_per_day,
          meal_plan: plan.meal_plan,
          recommended_food_types: plan.recommended_food_types,
          treat_guidelines: plan.treat_guidelines,
          transition_plan: plan.transition_plan,
          special_considerations: plan.special_considerations,
          red_flag_foods: plan.red_flag_foods,
          model_used: metadata.model,
          latency_ms: metadata.latency_ms,
          cost_usd: metadata.cost_usd,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn(`Failed to store nutrition plan: ${error.message}`);
        return null;
      }
      return data?.id;
    } catch (err) {
      this.logger.error(`Unexpected error storing nutrition plan: ${err}`);
      return null;
    }
  }

  // ============================================
  // Training Data Methods
  // ============================================

  /**
   * Get training preferences for a pet
   */
  async getTrainingPreferences(preferenceId: string) {
    try {
      const { data, error } = await this.supabase
        .from('pet_training_preferences')
        .select('*')
        .eq('id', preferenceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Training preferences', preferenceId);
        }
        this.logger.error(`Failed to fetch training preferences: ${error.message}`);
        throw new DatabaseException('fetch training preferences', error.message);
      }
      return data;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof DatabaseException) {
        throw err;
      }
      this.logger.error(`Unexpected error fetching training preferences: ${err}`);
      throw new DatabaseException('fetch training preferences');
    }
  }

  /**
   * Store training plan in database
   */
  async storeTrainingPlan(
    petId: string,
    preferenceId: string,
    plan: any,
    metadata: { model: string; latency_ms: number; cost_usd: number },
  ) {
    try {
      const { data, error } = await this.supabase
        .from('training_plans')
        .insert({
          pet_id: petId,
          preference_id: preferenceId,
          summary: plan.summary,
          difficulty_level: plan.difficulty_level,
          safety_notes: plan.safety_notes,
          primary_behaviors: plan.primary_behaviors,
          overall_metrics: plan.overall_metrics,
          weekly_plan: plan.weekly_plan,
          model_used: metadata.model,
          latency_ms: metadata.latency_ms,
          cost_usd: metadata.cost_usd,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn(`Failed to store training plan: ${error.message}`);
        return null;
      }
      return data?.id;
    } catch (err) {
      this.logger.error(`Unexpected error storing training plan: ${err}`);
      return null;
    }
  }

  // ============================================
  // Grooming Data Methods
  // ============================================

  /**
   * Get recent grooming logs for a pet
   * Used for calculating current grooming routine frequency
   */
  async getGroomingLogs(petId: string, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('pet_grooming_logs')
        .select('category, logged_at, details')
        .eq('pet_id', petId)
        .order('logged_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`Grooming logs query failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      this.logger.error(`Unexpected error fetching grooming logs: ${err}`);
      return [];
    }
  }

  /**
   * Get pet allergies from pet_allergies table
   */
  async getPetAllergiesFromTable(petId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('pet_allergies')
        .select('allergen')
        .eq('pet_id', petId);

      if (error) {
        this.logger.warn(`Pet allergies query failed: ${error.message}`);
        return [];
      }
      return (data || []).map((a: any) => a.allergen);
    } catch (err) {
      this.logger.error(`Unexpected error fetching pet allergies: ${err}`);
      return [];
    }
  }

  /**
   * Get skin issues from PawScan history
   * Extracts skin-related risk flags from recent PawScan sessions
   */
  async getSkinIssuesFromPawScan(petId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('pawscan_sessions')
        .select('risk_flags')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        this.logger.warn(`PawScan skin issues query failed: ${error.message}`);
        return [];
      }

      const skinIssues: string[] = [];
      (data || []).forEach((session: any) => {
        if (session.risk_flags && Array.isArray(session.risk_flags)) {
          session.risk_flags.forEach((flag: string) => {
            const lowerFlag = flag.toLowerCase();
            if (
              lowerFlag.includes('skin') ||
              lowerFlag.includes('irritation') ||
              lowerFlag.includes('redness') ||
              lowerFlag.includes('rash') ||
              lowerFlag.includes('itching') ||
              lowerFlag.includes('scratching')
            ) {
              if (!skinIssues.includes(flag)) {
                skinIssues.push(flag);
              }
            }
          });
        }
      });

      return skinIssues;
    } catch (err) {
      this.logger.error(`Unexpected error fetching skin issues: ${err}`);
      return [];
    }
  }

  /**
   * Store grooming plan in database
   */
  async storeGroomingPlan(
    petId: string,
    category: string,
    plan: any,
    metadata: { model: string; latency_ms: number; cost_usd: number },
  ) {
    try {
      const { data, error } = await this.supabase
        .from('grooming_plans')
        .insert({
          pet_id: petId,
          category,
          plan_data: plan,
          model_used: metadata.model,
          latency_ms: metadata.latency_ms,
          cost_usd: metadata.cost_usd,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn(`Failed to store grooming plan: ${error.message}`);
        return null;
      }
      return data?.id;
    } catch (err) {
      this.logger.error(`Unexpected error storing grooming plan: ${err}`);
      return null;
    }
  }
}
