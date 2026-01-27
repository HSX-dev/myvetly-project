import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OpenaiProvider, DeepseekProvider } from '../../../infrastructure/ai-providers';
import { BaseAiService } from '../shared/base-ai.service';
import { AI_PROMPTS, RATE_LIMITS } from '../shared/prompts.constants';
import { SoapExpandRequestDto, SoapExpandResponseDto, SoapUndoRequestDto } from './soap.dto';
import { NotFoundException } from '../../../common/exceptions';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SoapService extends BaseAiService {
  constructor(
    supabaseService: SupabaseService,
    redisService: RedisService,
    openaiProvider: OpenaiProvider,
    deepseekProvider: DeepseekProvider,
  ) {
    super(supabaseService, redisService, openaiProvider, deepseekProvider);
  }

  async expand(dto: SoapExpandRequestDto, userId: string): Promise<SoapExpandResponseDto> {
    const startTime = Date.now();

    await this.checkRateLimit(
      `rate:soap:${userId}`,
      RATE_LIMITS.SOAP.maxRequests,
      RATE_LIMITS.SOAP.windowSeconds,
    );

    // Fetch appointment
    const { data: appointment, error } = await this.getSupabase()
      .from('appointments')
      .select('*, pets(*)')
      .eq('id', dto.appointment_id)
      .single();

    if (error || !appointment) {
      throw new NotFoundException('Appointment', dto.appointment_id);
    }

    const userPrompt = this.buildExpandPrompt(appointment, dto.current_data, dto.section);
    
    // Use DeepSeek for SOAP (more thorough clinical notes)
    const response = await this.callDeepSeek(AI_PROMPTS.SOAP_SYSTEM, userPrompt, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    // Parse response
    let expanded: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      expanded = JSON.parse(jsonMatch?.[0] || response.content);
    } catch {
      expanded = { [dto.section || 'all']: response.content };
    }

    // Create snapshot for undo
    const snapshotId = uuidv4();
    await this.getSupabase().from('soap_snapshots').insert({
      id: snapshotId,
      appointment_id: dto.appointment_id,
      snapshot_data: dto.current_data,
      created_by: userId,
    });

    this.logTiming('SOAP expand', startTime);

    return {
      appointment_id: dto.appointment_id,
      expanded,
      snapshot_id: snapshotId,
    };
  }

  async undo(dto: SoapUndoRequestDto, userId: string): Promise<any> {
    const { data: snapshot, error } = await this.getSupabase()
      .from('soap_snapshots')
      .select('*')
      .eq('id', dto.snapshot_id)
      .single();

    if (error || !snapshot) {
      throw new NotFoundException('Snapshot', dto.snapshot_id);
    }

    return {
      success: true,
      restored_data: snapshot.snapshot_data,
    };
  }

  private buildExpandPrompt(appointment: any, currentData: any, section?: string): string {
    return `Expand the following SOAP notes for a veterinary appointment.

PET: ${appointment.pets?.name} (${appointment.pets?.species}, ${appointment.pets?.breed})
APPOINTMENT TYPE: ${appointment.service_type}

CURRENT NOTES:
${JSON.stringify(currentData || {}, null, 2)}

${section ? `Focus on expanding the "${section}" section.` : 'Expand all sections.'}

Respond with JSON containing the expanded sections:
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}`;
  }
}
