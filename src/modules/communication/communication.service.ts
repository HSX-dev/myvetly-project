import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CommunicationService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    // Try with relationships first, fallback to basic select if relationships don't exist
    let query = this.supabaseService
      .getClient()
      .from('messages')
      .select('*, from_user:users(*), to_user:users(*)');

    // Try to order by created_at first
    let { data, error } = await query.order('created_at', { ascending: false });

    // If created_at doesn't exist, try timestamp
    if (error && error.message?.includes('column') && error.message?.includes('created_at') && error.message?.includes('does not exist')) {
      console.warn('created_at column not found, trying timestamp...');
      const timestampQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*, from_user:users(*), to_user:users(*)');
      const result = await timestampQuery.order('timestamp', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If timestamp also doesn't exist, try id
    if (error && error.message?.includes('column') && error.message?.includes('timestamp') && error.message?.includes('does not exist')) {
      console.warn('timestamp column not found, trying id...');
      const idQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*, from_user:users(*), to_user:users(*)');
      const result = await idQuery.order('id', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If all ordering columns fail, try without ordering
    if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
      console.warn('All ordering columns not found, fetching without ordering...');
      const { data: unorderedData, error: unorderedError } = await this.supabaseService
        .getClient()
        .from('messages')
        .select('*, from_user:users(*), to_user:users(*)');

      if (!unorderedError) {
        return unorderedData || [];
      }

      // If relationships also fail, try basic select
      const { data: basicData, error: basicError } = await this.supabaseService
        .getClient()
        .from('messages')
        .select('*');

      if (!basicError) {
        return basicData || [];
      }

      error = basicError;
    }

    // If relationship error, try without relationships
    if (error && (error.message?.includes('relationship') || (error.message?.includes('does not exist') && !error.message?.includes('column')))) {
      console.warn('Relationships not found, falling back to basic select:', error.message);
      let basicQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*');

      // Try ordering by created_at, timestamp, or id
      let { data: basicData, error: basicError } = await basicQuery.order('created_at', { ascending: false });

      if (basicError && basicError.message?.includes('column') && basicError.message?.includes('created_at')) {
        const timestampResult = await basicQuery.order('timestamp', { ascending: false });
        basicData = timestampResult.data;
        basicError = timestampResult.error;
      }

      if (basicError && basicError.message?.includes('column') && basicError.message?.includes('timestamp')) {
        const idResult = await basicQuery.order('id', { ascending: false });
        basicData = idResult.data;
        basicError = idResult.error;
      }

      if (basicError && basicError.message?.includes('column') && basicError.message?.includes('does not exist')) {
        // If all ordering fails, just select without ordering
        const noOrderResult = await this.supabaseService
          .getClient()
          .from('messages')
          .select('*');
        basicData = noOrderResult.data;
        basicError = noOrderResult.error;
      }

      if (basicError) {
        console.error('Error fetching messages:', basicError);
        throw new InternalServerErrorException(
          `Failed to fetch messages: ${basicError.message || 'Unknown error'}`,
        );
      }

      return basicData || [];
    }

    if (error) {
      console.error('Error fetching messages:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The messages table does not exist in the database. Please create the table.',
        );
      }
      
      // Check if it's a column error - try without ordering
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        console.warn('Column error detected, trying without ordering...');
        const { data: unorderedData, error: unorderedError } = await this.supabaseService
          .getClient()
          .from('messages')
          .select('*, from_user:users(*), to_user:users(*)');

        if (!unorderedError) {
          return unorderedData || [];
        }

        // If relationships also fail, try basic select
        const { data: basicData, error: basicError } = await this.supabaseService
          .getClient()
          .from('messages')
          .select('*');

        if (!basicError) {
          return basicData || [];
        }

        throw new BadRequestException(
          `The messages table exists but has a different schema than expected. Error: ${error.message}`,
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch messages: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  async findOne(id: string) {
    if (!id || id.trim() === '') {
      throw new BadRequestException('Message id is required');
    }

    // Try with relationships first, fallback to basic select if relationships don't exist
    let { data, error } = await this.supabaseService
      .getClient()
      .from('messages')
      .select('*, from_user:users(*), to_user:users(*)')
      .eq('id', id)
      .single();

    // If relationship error, try without relationships
    if (error && (error.message?.includes('relationship') || error.message?.includes('does not exist'))) {
      console.warn('Relationships not found, falling back to basic select:', error.message);
      const { data: basicData, error: basicError } = await this.supabaseService
        .getClient()
        .from('messages')
        .select('*')
        .eq('id', id)
        .single();

      if (basicError) {
        if (basicError.code === 'PGRST116') {
          throw new NotFoundException(`Message with id ${id} not found`);
        }
        console.error('Error fetching message:', basicError);
        throw new InternalServerErrorException(
          `Failed to fetch message: ${basicError.message || 'Unknown error'}`,
        );
      }

      return basicData;
    }

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Message with id ${id} not found`);
      }
      
      console.error('Error fetching message:', error);
      throw new InternalServerErrorException(
        `Failed to fetch message: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  async findByUser(userId: string) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('user_id is required');
    }

    // Try different column name combinations
    // First try: from_user_id/to_user_id (traditional messaging)
    let query = this.supabaseService
      .getClient()
      .from('messages')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

    let { data, error } = await query.order('created_at', { ascending: false });

    // If from_user_id/to_user_id don't exist, try sender_id/recipient_id
    if (error && error.message?.includes('column') && (error.message?.includes('from_user_id') || error.message?.includes('to_user_id'))) {
      console.warn('from_user_id/to_user_id columns not found, trying sender_id/recipient_id...');
      const senderQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
      
      const result = await senderQuery.order('created_at', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If sender_id/recipient_id also don't exist, try just sender_id
    if (error && error.message?.includes('column') && (error.message?.includes('sender_id') || error.message?.includes('recipient_id'))) {
      console.warn('sender_id/recipient_id columns not found, trying sender_id only...');
      const senderOnlyQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*')
        .eq('sender_id', userId);
      
      const result = await senderOnlyQuery.order('created_at', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If created_at doesn't exist, try timestamp
    if (error && error.message?.includes('column') && error.message?.includes('created_at') && error.message?.includes('does not exist')) {
      console.warn('created_at column not found, trying timestamp...');
      // Rebuild query with timestamp
      let timestampQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*');
      
      // Try to use the column that worked (or default to sender_id)
      try {
        timestampQuery = timestampQuery.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      } catch {
        try {
          timestampQuery = timestampQuery.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
        } catch {
          timestampQuery = timestampQuery.eq('sender_id', userId);
        }
      }
      
      const result = await timestampQuery.order('timestamp', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If timestamp also doesn't exist, try id
    if (error && error.message?.includes('column') && error.message?.includes('timestamp') && error.message?.includes('does not exist')) {
      console.warn('timestamp column not found, trying id...');
      let idQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*');
      
      try {
        idQuery = idQuery.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      } catch {
        try {
          idQuery = idQuery.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
        } catch {
          idQuery = idQuery.eq('sender_id', userId);
        }
      }
      
      const result = await idQuery.order('id', { ascending: false });
      data = result.data;
      error = result.error;
    }

    // If all ordering fails, try without ordering
    if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
      console.warn('All timestamp columns not found, fetching without ordering...');
      let unorderedQuery = this.supabaseService
        .getClient()
        .from('messages')
        .select('*');
      
      // Try different column combinations
      try {
        unorderedQuery = unorderedQuery.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      } catch {
        try {
          unorderedQuery = unorderedQuery.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
        } catch {
          try {
            unorderedQuery = unorderedQuery.eq('sender_id', userId);
          } catch {
            // If all user ID columns fail, try to get all messages and filter in memory
            // This is a fallback if the table structure doesn't support user filtering
            console.warn('No user ID columns found, fetching all messages (user filtering not supported by table schema)...');
            const { data: allMessages, error: allError } = await this.supabaseService
              .getClient()
              .from('messages')
              .select('*');

            if (allError) {
              error = allError;
            } else {
              // Return empty array with a note that user filtering isn't supported
              // The table exists but doesn't have user ID columns
              console.warn(`The messages table exists but does not support user filtering. Returning empty array.`);
              return [];
            }
          }
        }
      }
      
      if (!error || !error.message?.includes('column')) {
        const { data: unorderedData, error: unorderedError } = await unorderedQuery;

        if (!unorderedError) {
          return unorderedData || [];
        }

        error = unorderedError;
      }
    }

    if (error) {
      console.error('Error fetching messages by user:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The messages table does not exist in the database. Please create the table.',
        );
      }
      
      // Check if column doesn't exist - the table exists but doesn't support user filtering
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        // Try to fetch all messages to confirm table exists
        const { data: allMessages, error: allError } = await this.supabaseService
          .getClient()
          .from('messages')
          .select('*')
          .limit(1);

        if (!allError && allMessages !== null) {
          // Table exists but doesn't have user ID columns
          throw new BadRequestException(
            `The messages table exists but does not have user ID columns (from_user_id/to_user_id or sender_id/recipient_id). User filtering is not supported. Please use the telehealth_messages table for user-specific messages, or update the messages table schema to include user ID columns.`,
          );
        }

        throw new BadRequestException(
          `The messages table exists but does not have the expected user ID columns. Error: ${error.message}`,
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch messages for user: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }
}

