import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Custom fetch implementation with extended timeout and retry logic
 * This prevents connection timeouts when Supabase is slow to respond
 * 
 * Root Cause:
 * - Node.js's native fetch (via undici) has a default 10-second connection timeout
 * - When the backend tries to connect to Supabase's REST API, network latency or
 *   slow Supabase responses can cause the connection to timeout after 10 seconds
 * - This results in "ConnectTimeoutError: Connect Timeout Error" errors
 * 
 * Solution:
 * - Extend timeout to 30 seconds to handle slower network conditions
 * - Add retry logic with exponential backoff for transient network errors
 * - This allows the backend to successfully connect even when Supabase is slow
 */
const createCustomFetch = () => {
  return async (url: string, options: RequestInit = {}) => {
    const timeoutMs = 30000; // 30 second timeout (increased from default 10s)
    const maxRetries = 2;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Merge the abort signal with any existing signal from options
        const existingSignal = (options as any)?.signal;
        let finalSignal = controller.signal;
        
        if (existingSignal) {
          // If there's an existing signal, listen to both
          existingSignal.addEventListener('abort', () => controller.abort());
        }
        
        const response = await fetch(url, {
          ...options,
          signal: finalSignal,
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        lastError = error;
        
        // Don't retry on abort (timeout) or if it's the last attempt
        if (error.name === 'AbortError' && attempt === maxRetries) {
          throw new Error(`Request timeout after ${timeoutMs}ms (attempted ${maxRetries + 1} times)`);
        }
        
        // Retry on network errors with exponential backoff
        const isNetworkError = 
          error.message?.includes('fetch failed') || 
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ENOTFOUND') ||
          error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          error.name === 'AbortError';
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Max 5 seconds, exponential backoff
          console.warn(`Supabase fetch attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms...`, {
            url: url.substring(0, 100), // Log partial URL for security
            error: error.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors or last attempt, throw immediately
        throw error;
      }
    }
    
    throw lastError || new Error('Failed to fetch after retries');
  };
};

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const serviceKey = this.configService.get<string>('supabase.serviceKey');
    
    if (!url || !serviceKey) {
      throw new Error('Supabase URL and service key must be configured');
    }
    
    // Create Supabase client with custom fetch that has extended timeout and retry logic
    this.supabase = createClient(url, serviceKey, {
      global: {
        fetch: createCustomFetch(),
      },
      db: {
        schema: 'public',
      },
      auth: {
        persistSession: false, // Backend doesn't need session persistence
        autoRefreshToken: false, // Backend doesn't need token refresh
      },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to get pet data with context
  async getPetContext(petId: string) {
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

    if (error) throw error;
    return pet;
  }

  // Helper method to get pet medical records
  async getPetMedicalRecords(petId: string, limit = 10) {
    const { data, error } = await this.supabase
      .from('medical_records')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // Helper method to get pet appointments
  async getPetAppointments(petId: string, limit = 5) {
    const { data, error } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('pet_id', petId)
      .order('appointment_time', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // Helper method to get pet vaccinations
  async getPetVaccinations(petId: string) {
    const { data, error } = await this.supabase
      .from('vaccinations')
      .select('*')
      .eq('pet_id', petId)
      .order('date_administered', { ascending: false });

    if (error) {
      // Handle table not found error (42P01)
      if (error.code === '42P01') {
        throw new Error('Vaccinations feature is not available: database table does not exist');
      }
      throw error;
    }
    return data || [];
  }

  // Helper method to get pet medications
  async getPetMedications(petId: string) {
    const { data, error } = await this.supabase
      .from('medications')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) {
      // Handle table not found error (42P01)
      if (error.code === '42P01') {
        throw new Error('Medications feature is not available: database table does not exist');
      }
      throw error;
    }
    return data || [];
  }
}
