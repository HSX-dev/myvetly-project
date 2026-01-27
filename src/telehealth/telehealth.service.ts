import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { CloseSessionDto } from './dto/close-session.dto';

@Injectable()
export class TelehealthService {
  constructor(private supabaseService: SupabaseService) { }

  /**
   * Get all telehealth sessions for a vet user
   * Matches the original frontend logic exactly - performs 4 queries and combines results:
   * 1. Sessions by appointment_id (filtered by vet_id)
   * 2. Sessions by client_id where appointment_id is null (filtered by vet_id)
   * 3. Sessions directly by vet_id
   * 4. Catch-all: Sessions for clinic clients where vet_id matches
   */
  async getVetSessions(user: UserContext): Promise<any[]> {
    const vetUserId = user.user_id;
    const clinicId = user.clinic_id;

    if (!clinicId) {
      // Fallback to vet_id only if no clinic_id
      return this.getVetSessionsByVetId(vetUserId);
    }

    // Get all appointment IDs and client IDs for this clinic in parallel
    const [appointmentsResult, clientsResult] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('appointments')
        .select('id')
        .eq('tenant_id', clinicId),
      this.supabaseService
        .getClient()
        .from('clients')
        .select('id')
        .eq('clinic_id', clinicId),
    ]);

    if (appointmentsResult.error) {
      console.error('Error fetching clinic appointments:', appointmentsResult.error);
      return this.getVetSessionsByVetId(vetUserId);
    }

    if (clientsResult.error) {
      console.error('Error fetching clinic clients:', clientsResult.error);
    }

    const appointmentIds = (appointmentsResult.data || []).map((apt: any) => apt.id);
    const clientIds = (clientsResult.data || []).map((client: any) => client.id);

    const queries: Array<Promise<{ data: any; error: any }>> = [];

    // Query 1: Sessions by appointment_id (if we have appointments) - filtered by logged-in user's vet_id
    if (appointmentIds.length > 0) {
      queries.push(
        (async () => {
          const result = await this.supabaseService
            .getClient()
            .from('telehealth_sessions')
            .select(`
              *,
              client:clients(
                id,
                users!clients_user_id_fkey(
                  id,
                  full_name,
                  email
                )
              ),
              pet:pets(
                id,
                name,
                species,
                breed,
                profile_image_url
              ),
              appointment:appointments(
                id,
                payment_status,
                status,
                appointment_time,
                tenant_id
              )
            `)
            .in('appointment_id', appointmentIds)
            .eq('vet_id', vetUserId)
            .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
            .order('updated_at', { ascending: false });
          return result;
        })()
      );
    }

    // Query 2: Sessions by client_id for sessions without appointment_id - filtered by logged-in user's vet_id
    if (clientIds.length > 0) {
      queries.push(
        (async () => {
          const result = await this.supabaseService
            .getClient()
            .from('telehealth_sessions')
            .select(`
              *,
              client:clients(
                id,
                users!clients_user_id_fkey(
                  id,
                  full_name,
                  email
                )
              ),
              pet:pets(
                id,
                name,
                species,
                breed,
                profile_image_url
              ),
              appointment:appointments(
                id,
                payment_status,
                status,
                appointment_time,
                tenant_id
              )
            `)
            .in('client_id', clientIds)
            .is('appointment_id', null)
            .eq('vet_id', vetUserId)
            .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
            .order('updated_at', { ascending: false });
          return result;
        })()
      );
    }

    // Query 3: Sessions directly by vet_id for the logged-in user only
    queries.push(
      (async () => {
        const result = await this.supabaseService
          .getClient()
          .from('telehealth_sessions')
          .select(`
            *,
            client:clients(
              id,
              users!clients_user_id_fkey(
                id,
                full_name,
                email
              )
            ),
            pet:pets(
              id,
              name,
              species,
              breed,
              profile_image_url
            ),
            appointment:appointments(
              id,
              payment_status,
              status,
              appointment_time,
              tenant_id
            )
          `)
          .eq('vet_id', vetUserId)
          .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
          .order('updated_at', { ascending: false });
        return result;
      })()
    );

    // Query 4: Catch-all - Get sessions for clinic clients where vet_id matches logged-in user
    // This ensures we catch sessions even if appointment matching failed
    if (clientIds.length > 0) {
      queries.push(
        (async () => {
          const result = await this.supabaseService
            .getClient()
            .from('telehealth_sessions')
            .select(`
              *,
              client:clients(
                id,
                clinic_id,
                users!clients_user_id_fkey(
                  id,
                  full_name,
                  email
                )
              ),
              pet:pets(
                id,
                name,
                species,
                breed,
                profile_image_url
              ),
              appointment:appointments(
                id,
                payment_status,
                status,
                appointment_time,
                tenant_id
              )
            `)
            .in('client_id', clientIds)
            .eq('vet_id', vetUserId)
            .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
            .order('updated_at', { ascending: false });
          return result;
        })()
      );
    }

    if (queries.length === 0) {
      return [];
    }

    // Execute all queries and combine results (matching original frontend logic)
    const results = await Promise.all(queries);
    const allSessions: any[] = [];
    const sessionIds = new Set<string>();

    for (const result of results) {
      if (result.error) {
        console.error('Query error:', result.error);
        continue;
      }
      if (result.data) {
        for (const session of result.data) {
          if (!sessionIds.has(session.id)) {
            sessionIds.add(session.id);
            allSessions.push(session);
          }
        }
      }
    }

    // Filter sessions to only include those where vet_id matches (additional safety check)
    const filteredSessions = allSessions.filter((session) => session.vet_id === vetUserId);

    // Sort by updated_at descending
    filteredSessions.sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });

    // Fetch last message and unread count for each session
    const sessionsWithMessages = await Promise.all(
      filteredSessions.map(async (session: any) => {
        const [lastMessage, unreadCount] = await Promise.all([
          this.getLastMessage(session.id),
          this.getUnreadCount(session.id),
        ]);

        // Handle users relationship (might be array or single object)
        const clientUser = session.client?.users;
        const user = Array.isArray(clientUser) ? clientUser[0] : clientUser;

        return {
          ...session,
          client: session.client
            ? {
              id: session.client.id,
              user: user
                ? {
                  id: user.id,
                  full_name: user.full_name,
                  email: user.email,
                }
                : undefined,
            }
            : undefined,
          last_message: lastMessage,
          unread_count: unreadCount,
        };
      })
    );

    return sessionsWithMessages;
  }

  /**
   * Fallback: Fetch sessions by vet_id only
   */
  private async getVetSessionsByVetId(vetUserId: string): Promise<any[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select(`
        *,
        client:clients(
          id,
          users!clients_user_id_fkey(
            id,
            full_name,
            email
          )
        ),
        pet:pets(
          id,
          name,
          species,
          breed,
          profile_image_url
        ),
        appointment:appointments(
          id,
          payment_status,
          status,
          appointment_time
        )
      `)
      .eq('vet_id', vetUserId)
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching vet sessions by vet_id:', error);
      throw new InternalServerErrorException('Failed to fetch sessions');
    }

    // Fetch last message and unread count for each session
    const sessionsWithMessages = await Promise.all(
      (data || []).map(async (session: any) => {
        const [lastMessage, unreadCount] = await Promise.all([
          this.getLastMessage(session.id),
          this.getUnreadCount(session.id),
        ]);

        const clientUser = session.client?.users;
        const user = Array.isArray(clientUser) ? clientUser[0] : clientUser;

        return {
          ...session,
          client: session.client
            ? {
              id: session.client.id,
              user: user
                ? {
                  id: user.id,
                  full_name: user.full_name,
                  email: user.email,
                }
                : undefined,
            }
            : undefined,
          last_message: lastMessage,
          unread_count: unreadCount,
        };
      })
    );

    return sessionsWithMessages;
  }

  /**
   * Get the last message for a session
   */
  private async getLastMessage(sessionId: string): Promise<any | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching last message:', error);
      return null;
    }

    return data;
  }

  /**
   * Get unread message count for a session (messages from clients that are unread)
   */
  private async getUnreadCount(sessionId: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('sender_type', 'client')
      .eq('is_read', false);

    if (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get a single session by ID
   */
  async findOne(id: string, user: UserContext): Promise<any> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select(`
        *,
        client:clients(
          id,
          users!clients_user_id_fkey(
            id,
            full_name,
            email
          )
        ),
        pet:pets(
          id,
          name,
          species,
          breed,
          profile_image_url
        ),
        appointment:appointments(
          id,
          payment_status,
          status,
          appointment_time,
          tenant_id
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new NotFoundException(`Telehealth session with id ${id} not found`);
    }

    // Verify user has access (vet_id matches or clinic access)
    if (data.vet_id !== user.user_id && user.clinic_id && data.appointment?.tenant_id !== user.clinic_id) {
      throw new NotFoundException(`Telehealth session with id ${id} not found`);
    }

    return data;
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(sessionId: string, user: UserContext): Promise<any[]> {
    // First verify session exists and user has access
    await this.findOne(sessionId, user);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException('Failed to fetch messages');
    }

    return data || [];
  }

  /**
   * Mark messages as read for a session (only client messages)
   */
  async markMessagesAsRead(sessionId: string, user: UserContext): Promise<void> {
    // Verify session exists and user has access
    await this.findOne(sessionId, user);

    const { error } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('sender_type', 'client')
      .eq('is_read', false);

    if (error) {
      throw new InternalServerErrorException('Failed to mark messages as read');
    }
  }

  /**
   * Close a telehealth session
   */
  async closeSession(sessionId: string, closeDto: CloseSessionDto, user: UserContext): Promise<void> {
    // Verify session exists and user has access
    const session = await this.findOne(sessionId, user);

    // Update session status
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        closed_by: user.user_id,
        closed_at: new Date().toISOString(),
        close_reason: closeDto.reason || 'Consultation completed',
      })
      .eq('id', sessionId)
      .select();

    if (error) {
      throw new InternalServerErrorException('Failed to close session');
    }

    // Send system message to notify pet owner
    const systemMessage = {
      session_id: sessionId,
      sender_id: user.user_id,
      sender_type: 'vet',
      message_type: 'system',
      content: 'This consultation has been closed by the veterinarian. Thank you for booking with us! We look forward to seeing you next time. If you have any further concerns, please book another appointment.',
      is_read: false,
    };

    const { error: messageError } = await this.supabaseService
      .getClient()
      .from('telehealth_messages')
      .insert(systemMessage);

    if (messageError) {
      console.error('Error sending closure notification message:', messageError);
      // Don't throw - session is already closed
    }
  }

  /**
   * Find session by appointment ID
   */
  async findByAppointment(appointmentId: string): Promise<any> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('telehealth_sessions')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Failed to fetch session');
    }

    return data;
  }
}
