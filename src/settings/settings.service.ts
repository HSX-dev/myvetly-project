import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SettingsService {
  constructor(private supabaseService: SupabaseService) {}

  async findClinicSettings(clinicId: string) {
    // Use clinics.settings JSONB column for storing arbitrary key-value settings
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('id, settings')
      .eq('id', clinicId)
      .single();

    if (error) {
      // Check for PostgREST schema cache error (column doesn't exist)
      if (error.code === 'PGRST204' || (error.message?.includes('column') && error.message?.includes('settings') && (error.message?.includes('does not exist') || error.message?.includes('schema cache')))) {
        // Return empty settings if column doesn't exist (graceful degradation)
        console.warn('Settings column does not exist, returning empty settings. Run migration to enable settings storage.');
        return {
          clinic_id: clinicId,
        };
      }
      
      // Check if clinic doesn't exist
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Clinic with id ${clinicId} not found`);
      }
      
      console.error('Error fetching clinic settings:', error);
      throw new InternalServerErrorException(
        `Failed to fetch clinic settings: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      return {
        clinic_id: clinicId,
        // Return default/empty settings structure
      };
    }

    // Return settings from JSONB column, or empty object if null
    return {
      clinic_id: clinicId,
      ...(data.settings || {}),
    };
  }

  async updateClinicSettings(clinicId: string, settings: any) {
    // Validate clinicId
    if (!clinicId || clinicId.trim() === '') {
      throw new BadRequestException('clinic_id is required');
    }

    // Validate settings object
    if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) {
      throw new BadRequestException('Settings object is required and cannot be empty');
    }

    // First, verify the clinic exists
    const { data: clinic, error: clinicError } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('id')
      .eq('id', clinicId)
      .single();

    if (clinicError || !clinic) {
      throw new BadRequestException(`Clinic with id ${clinicId} does not exist`);
    }

    // Clean settings to remove null/undefined values
    const cleanedSettings = Object.entries(settings).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    // Get existing settings to merge with new ones
    const { data: existingClinic } = await this.supabaseService
      .getClient()
      .from('clinics')
      .select('settings')
      .eq('id', clinicId)
      .single();

    // Merge existing settings with new ones
    const existingSettings = existingClinic?.settings || {};
    const mergedSettings = { ...existingSettings, ...cleanedSettings };

    // Update clinics.settings JSONB column
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinics')
      .update({ settings: mergedSettings })
      .eq('id', clinicId)
      .select('id, settings')
      .single();

    if (error) {
      console.error('Error updating clinic settings:', JSON.stringify(error, null, 2));
      
      // Check for PostgREST schema cache error (column doesn't exist)
      if (error.code === 'PGRST204' || (error.message?.includes('column') && error.message?.includes('settings') && (error.message?.includes('does not exist') || error.message?.includes('schema cache')))) {
        throw new BadRequestException(
          'The clinics table does not have a settings JSONB column. Please run the migration file: vetly-api/src/database/migrations/add-settings-to-clinics.sql in your Supabase SQL Editor to add the column.',
        );
      }
      
      // Check if clinic doesn't exist
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Clinic with id ${clinicId} not found`);
      }
      
      // Check for RLS (Row Level Security) errors
      if (error.message?.includes('permission denied') || error.message?.includes('RLS')) {
        throw new ForbiddenException(
          `Access denied: You do not have permission to update settings for clinic ${clinicId}.`,
        );
      }
      
      throw new BadRequestException(
        `Failed to update clinic settings: ${error.message || 'Unknown error'}`,
      );
    }

    // Return settings from JSONB column
    return {
      clinic_id: clinicId,
      ...(data.settings || {}),
    };
  }
}

