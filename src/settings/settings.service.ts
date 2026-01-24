import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SettingsService {
  constructor(private supabaseService: SupabaseService) {}

  async findClinicSettings(clinicId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinic_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .single();

    if (error) throw new NotFoundException(`Settings for clinic ${clinicId} not found`);
    return data;
  }

  async updateClinicSettings(clinicId: string, settings: any) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clinic_settings')
      .upsert({ clinic_id: clinicId, ...settings })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

