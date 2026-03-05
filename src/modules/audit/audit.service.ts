import { Injectable, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';
import { LogAuthEventDto } from './dto/log-auth-event.dto';

@Injectable()
export class AuditService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Resolve user UUIDs to full_name + email from the users table.
   * Since we dropped FK constraints on audit_logs, PostgREST can't auto-join,
   * so we do a secondary lookup for the unique user IDs in each result set.
   */
  private async resolveUsers(logs: any[]): Promise<any[]> {
    if (!logs || logs.length === 0) return logs;

    // Collect unique non-null user IDs (performed_by)
    const userIds = [...new Set(
      logs
        .map((log) => log.performed_by)
        .filter((id): id is string => !!id && id !== '00000000-0000-0000-0000-000000000000')
    )];

    if (userIds.length === 0) return logs;

    // Batch fetch user info
    const { data: users, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, full_name, email, auth_user_id')
      .in('auth_user_id', userIds);

    if (error || !users) {
      console.warn('Could not resolve audit log users:', error?.message);
      return logs;
    }

    // Build lookup map: auth_user_id -> { id, full_name, email }
    const userMap = new Map<string, { id: string; full_name: string; email?: string }>();
    for (const u of users) {
      userMap.set(u.auth_user_id, {
        id: u.id,
        full_name: u.full_name || 'Unknown User',
        email: u.email,
      });
    }

    // Attach user info to each log entry
    return logs.map((log) => ({
      ...log,
      user: log.performed_by ? userMap.get(log.performed_by) || null : null,
    }));
  }

  /**
   * Apply role-based access filtering to a query
   * - super_admin: sees all (can optionally filter by clinic)
   * - org_admin: sees all clinics in their organization
   * - clinic_admin / others: restricted to their own clinic
   */
  private applyAccessFilter(query: any, user: UserContext, clinicId?: string) {
    if (user.role === 'super_admin') {
      // Super admin can optionally filter by clinic
      if (clinicId) {
        query = query.eq('clinic_id', clinicId);
      }
    } else if (user.role === 'org_admin') {
      // Org admin sees all clinics in their organization
      if (!user.organization_id) {
        throw new ForbiddenException('Access denied: No organization associated with your account');
      }
      query = query.eq('organization_id', user.organization_id);
    } else {
      // clinic_admin and all other roles — restricted to their clinic
      if (!user.clinic_id) {
        throw new ForbiddenException('Access denied: No clinic associated with your account');
      }
      query = query.eq('clinic_id', user.clinic_id);
    }
    return query;
  }

  /**
   * Get audit logs with filtering and pagination
   * Access is scoped by role: super_admin > org_admin > clinic_admin
   */
  async getAuditLogs(filters: AuditLogFiltersDto, user: UserContext) {
    const {
      tableName,
      action,
      userId,
      recordId,
      dateFrom,
      dateTo,
      search,
      clinicId,
      page = 1,
      pageSize = 25,
    } = filters;

    let query = this.supabaseService
      .getClient()
      .from('audit_logs')
      .select(
        `
        id,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changes,
        user_id,
        performed_by,
        performed_at,
        created_at,
        clinic_id,
        organization_id,
        ip_address,
        source,
        description
      `,
        { count: 'exact' }
      )
      .order('performed_at', { ascending: false });

    // Apply role-based access filtering
    query = this.applyAccessFilter(query, user, clinicId);

    // Apply filters
    if (tableName) {
      query = query.eq('table_name', tableName);
    }
    if (action) {
      query = query.eq('action', action);
    }
    if (userId) {
      query = query.or(`user_id.eq.${userId},performed_by.eq.${userId}`);
    }
    if (recordId) {
      query = query.eq('record_id', recordId);
    }
    if (dateFrom) {
      query = query.gte('performed_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('performed_at', dateTo);
    }
    if (search) {
      query = query.or(
        `description.ilike.%${search}%,table_name.ilike.%${search}%,record_id::text.ilike.%${search}%`
      );
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      throw new InternalServerErrorException(`Failed to fetch audit logs: ${error.message}`);
    }

    // Resolve user UUIDs to full_name + email
    const enrichedData = await this.resolveUsers(data || []);

    return {
      data: enrichedData,
      total: count || 0,
    };
  }

  /**
   * Get distinct table names that have audit entries
   * Scoped by role: super_admin > org_admin > clinic_admin
   */
  async getAuditedTables(user: UserContext) {
    let query = this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('table_name');

    // Apply role-based access filtering
    query = this.applyAccessFilter(query, user);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching audited tables:', error);
      throw new InternalServerErrorException(`Failed to fetch audited tables: ${error.message}`);
    }

    // Extract unique table names
    const tableNames = [...new Set((data || []).map((row: any) => row.table_name))];
    return tableNames.sort();
  }

  /**
   * Get audit history for a specific record
   */
  async getRecordAuditHistory(tableName: string, recordId: string, user: UserContext) {
    let query = this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('performed_at', { ascending: false });

    // Apply role-based access filtering
    query = this.applyAccessFilter(query, user);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching record audit history:', error);
      throw new InternalServerErrorException(`Failed to fetch record audit history: ${error.message}`);
    }

    // Resolve user UUIDs to full_name + email
    const enrichedData = await this.resolveUsers(data || []);

    return enrichedData;
  }

  /**
   * Get distinct users who have performed audited actions
   * Used for the "Filter by User" dropdown in the UI
   */
  async getAuditUsers(user: UserContext) {
    let query = this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('performed_by');

    // Apply role-based access filtering
    query = this.applyAccessFilter(query, user);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching audit users:', error);
      throw new InternalServerErrorException(`Failed to fetch audit users: ${error.message}`);
    }

    // Extract unique non-null user IDs
    const userIds = [...new Set(
      (data || [])
        .map((row: any) => row.performed_by)
        .filter((id): id is string => !!id && id !== '00000000-0000-0000-0000-000000000000')
    )];

    if (userIds.length === 0) return [];

    // Resolve to full_name + email
    const { data: users, error: usersError } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, full_name, email, auth_user_id, role')
      .in('auth_user_id', userIds)
      .order('full_name', { ascending: true });

    if (usersError || !users) {
      console.warn('Could not resolve audit users:', usersError?.message);
      return [];
    }

    return users.map((u) => ({
      id: u.auth_user_id,
      full_name: u.full_name || 'Unknown User',
      email: u.email,
      role: u.role,
    }));
  }

  /**
   * Log an authentication event
   * Called from frontend via API for trusted server-side logging
   */
  async logAuthEvent(dto: LogAuthEventDto, request: any) {
    // Extract IP and user agent from the request if not provided
    const ipAddress = dto.ipAddress || request?.ip || request?.headers?.['x-forwarded-for'] || null;
    const userAgent = dto.userAgent || request?.headers?.['user-agent'] || null;

    try {
      const { error } = await this.supabaseService
        .getClient()
        .rpc('log_auth_event', {
          p_action: dto.action,
          p_user_id: dto.userId || null,
          p_email: dto.email || null,
          p_ip_address: ipAddress,
          p_user_agent: userAgent,
          p_details: dto.details ? JSON.stringify(dto.details) : null,
        });

      if (error) {
        console.error('Error logging auth event:', error);
        // Don't throw - auth logging shouldn't break the main operation
      }
    } catch (err) {
      console.error('Failed to log auth event:', err);
      // Don't throw - auth logging shouldn't break the main operation
    }

    return { success: true };
  }
}
