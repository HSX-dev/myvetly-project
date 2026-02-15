import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class LabsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    // Try 'labs' table first, fallback to 'lab_results' if it doesn't exist
    let { data, error } = await this.supabaseService
      .getClient()
      .from('labs')
      .select('*')
      .order('created_at', { ascending: false });

    // If 'labs' table doesn't exist, try 'lab_results'
    if (error && error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.warn('labs table not found, trying lab_results table...');
      const { data: labResultsData, error: labResultsError } = await this.supabaseService
        .getClient()
        .from('lab_results')
        .select('*')
        .order('created_at', { ascending: false });

      if (!labResultsError) {
        return labResultsData || [];
      }

      // If both fail, return clear error
      throw new BadRequestException(
        'Neither the labs nor lab_results table exists in the database. Please create one of these tables.',
      );
    }

    if (error) {
      console.error('Error fetching all labs:', error);
      throw new InternalServerErrorException(
        `Failed to fetch labs: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  async findOne(id: string) {
    if (!id || id.trim() === '') {
      throw new BadRequestException('Lab record id is required');
    }

    // Try 'labs' table first, fallback to 'lab_results' if it doesn't exist
    let { data, error } = await this.supabaseService
      .getClient()
      .from('labs')
      .select('*')
      .eq('id', id)
      .single();

    // If 'labs' table doesn't exist, try 'lab_results'
    if (error && error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.warn('labs table not found, trying lab_results table...');
      const { data: labResultsData, error: labResultsError } = await this.supabaseService
        .getClient()
        .from('lab_results')
        .select('*')
        .eq('id', id)
        .single();

      if (!labResultsError) {
        return labResultsData;
      }

      // If both fail, check if it's a not found error
      if (labResultsError.code === 'PGRST116') {
        throw new NotFoundException(`Lab record with id ${id} not found`);
      }

      throw new BadRequestException(
        'Neither the labs nor lab_results table exists in the database. Please create one of these tables.',
      );
    }

    if (error) {
      // Check if record not found
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Lab record with id ${id} not found`);
      }
      
      console.error('Error fetching lab record:', error);
      throw new InternalServerErrorException(
        `Failed to fetch lab record: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  async findByPet(petId: string) {
    if (!petId || petId.trim() === '') {
      throw new BadRequestException('pet_id is required');
    }

    // Try 'labs' table first, fallback to 'lab_results' if it doesn't exist
    let { data, error } = await this.supabaseService
      .getClient()
      .from('labs')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    // If 'labs' table doesn't exist, try 'lab_results'
    if (error && error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.warn('labs table not found, trying lab_results table...');
      const { data: labResultsData, error: labResultsError } = await this.supabaseService
        .getClient()
        .from('lab_results')
        .select('*')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false });

      if (!labResultsError) {
        return labResultsData || [];
      }

      // If both fail, return clear error
      throw new BadRequestException(
        'Neither the labs nor lab_results table exists in the database. Please create one of these tables.',
      );
    }

    if (error) {
      console.error('Error fetching labs by pet:', error);
      throw new InternalServerErrorException(
        `Failed to fetch labs for pet: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }
}

