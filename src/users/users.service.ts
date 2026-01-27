import { Injectable, NotFoundException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all users with RLS filtering based on user role
   * Excludes 'client' role users (clients are managed separately)
   */
  async findAll(user: UserContext) {
    const userQuery = `
      id,
      auth_user_id,
      email,
      full_name,
      first_name,
      last_name,
      role,
      role_id,
      role_name,
      organization_id,
      clinic_id,
      status,
      created_at,
      has_set_password,
      organizations!users_organization_id_fkey(id, name),
      clinics!users_clinic_id_fkey(id, name)
    `;

    let query = this.supabaseService
      .getClient()
      .from('users')
      .select(userQuery);

    // IMPORTANT: Exclude clients - User Management is for staff only
    query = query.neq('role', 'client');

    // Apply RLS filtering based on user role
    if (user.role === 'org_admin') {
      query = query.eq('organization_id', user.organization_id);
    } else if (user.role !== 'super_admin') {
      query = query
        .eq('organization_id', user.organization_id)
        .eq('clinic_id', user.clinic_id);
    }
    // super_admin: no filtering applied

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      throw new InternalServerErrorException(
        `Failed to fetch users: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Get a single user by ID with RLS filtering
   */
  async findOne(id: string, user: UserContext) {
    const userQuery = `
      id,
      auth_user_id,
      email,
      full_name,
      first_name,
      last_name,
      role,
      role_id,
      role_name,
      organization_id,
      clinic_id,
      status,
      created_at,
      has_set_password,
      organizations!users_organization_id_fkey(id, name),
      clinics!users_clinic_id_fkey(id, name)
    `;

    let query = this.supabaseService
      .getClient()
      .from('users')
      .select(userQuery)
      .eq('id', id);

    // Apply RLS filtering
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        query = query.eq('organization_id', user.organization_id);
      } else {
        query = query
          .eq('organization_id', user.organization_id)
          .eq('clinic_id', user.clinic_id);
      }
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`User with id ${id} not found`);
      }
      console.error('Error fetching user:', error);
      throw new InternalServerErrorException(
        `Failed to fetch user: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  async findByEmail(email: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) throw new NotFoundException(`User with email ${email} not found`);
    return data;
  }

  /**
   * Create a new user
   * Note: This only creates the user record in the users table.
   * Auth user creation (auth.users) should be handled by frontend Edge Functions.
   */
  async create(createUserDto: CreateUserDto, user: UserContext) {
    // RLS Validation: Check if user can create users in the specified org/clinic
    if (user.role === 'super_admin') {
      // Super admin can create users anywhere
    } else if (user.role === 'org_admin') {
      // Org admin can only create users in their organization
      if (createUserDto.organization_id !== user.organization_id) {
        throw new ForbiddenException('Access denied: Cannot create users outside your organization');
      }
    } else {
      // Clinic admin and below can only create users in their clinic
      if (createUserDto.organization_id !== user.organization_id || 
          createUserDto.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot create users outside your clinic');
      }
    }

    // Handle name fields - construct full_name if not provided
    const updateData = { ...createUserDto };
    if (!updateData.full_name && (updateData.first_name || updateData.last_name)) {
      updateData.full_name = `${updateData.first_name || ''} ${updateData.last_name || ''}`.trim();
    } else if (updateData.full_name && (!updateData.first_name || !updateData.last_name)) {
      // Split full_name if first_name/last_name not provided
      const nameParts = updateData.full_name.trim().split(' ');
      if (nameParts.length >= 2) {
        updateData.first_name = nameParts[0];
        updateData.last_name = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        updateData.first_name = nameParts[0];
        updateData.last_name = '';
      }
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .insert(updateData)
      .select(`
        id,
        auth_user_id,
        email,
        full_name,
        first_name,
        last_name,
        role,
        role_id,
        role_name,
        organization_id,
        clinic_id,
        status,
        created_at,
        has_set_password,
        organizations!users_organization_id_fkey(id, name),
        clinics!users_clinic_id_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('Error creating user:', error);
      throw new InternalServerErrorException(
        `Failed to create user: ${error.message || 'Unknown error'}`,
      );
    }
    return data;
  }

  /**
   * Update a user
   * Note: Password updates should be handled by frontend Edge Functions.
   */
  async update(id: string, updateUserDto: UpdateUserDto, user: UserContext) {
    // First, get the target user to validate access
    const targetUser = await this.findOne(id, user);

    // RLS Validation: Check if user can update this specific user
    if (user.role === 'super_admin') {
      // Super admin can update any user
    } else if (user.role === 'org_admin') {
      // Org admin can only update users in their organization
      if (targetUser.organization_id !== user.organization_id) {
        throw new ForbiddenException('Access denied: Cannot update users outside your organization');
      }
    } else {
      // Clinic admin and below can only update users in their clinic
      if (targetUser.organization_id !== user.organization_id || 
          targetUser.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot update users outside your clinic');
      }
    }

    // Handle name fields - construct full_name if first_name/last_name are updated
    const updateData = { ...updateUserDto };
    if (updateData.first_name !== undefined || updateData.last_name !== undefined) {
      const finalFirstName = updateData.first_name !== undefined 
        ? updateData.first_name 
        : targetUser.first_name || '';
      const finalLastName = updateData.last_name !== undefined 
        ? updateData.last_name 
        : targetUser.last_name || '';
      updateData.full_name = `${finalFirstName} ${finalLastName}`.trim();
    } else if (updateData.full_name !== undefined) {
      // Split full_name if provided directly
      const nameParts = updateData.full_name.trim().split(' ');
      if (nameParts.length >= 2) {
        updateData.first_name = nameParts[0];
        updateData.last_name = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        updateData.first_name = nameParts[0];
        updateData.last_name = '';
      }
    }

    // Remove password fields - password updates should be handled by frontend Edge Functions
    delete (updateData as any).password;
    delete (updateData as any).confirm_password;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        auth_user_id,
        email,
        full_name,
        first_name,
        last_name,
        role,
        role_id,
        role_name,
        organization_id,
        clinic_id,
        status,
        created_at,
        has_set_password,
        organizations!users_organization_id_fkey(id, name),
        clinics!users_clinic_id_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw new InternalServerErrorException(
        `Failed to update user: ${error.message || 'Unknown error'}`,
      );
    }
    return data;
  }

  /**
   * Remove a user (soft delete - sets status to 'deleted')
   * Note: Auth user deletion should be handled by frontend Edge Functions.
   */
  async remove(id: string, user: UserContext) {
    // First, get the target user to validate access
    const targetUser = await this.findOne(id, user);

    // Prevent self-deletion
    if (targetUser.auth_user_id === user.auth_user_id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    // RLS Validation: Check if user can delete this specific user
    if (user.role === 'super_admin') {
      // Super admin can delete any user
    } else if (user.role === 'org_admin') {
      // Org admin can only delete users in their organization
      if (targetUser.organization_id !== user.organization_id) {
        throw new ForbiddenException('Access denied: Cannot delete users outside your organization');
      }
    } else {
      // Clinic admin and below can only delete users in their clinic
      if (targetUser.organization_id !== user.organization_id || 
          targetUser.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot delete users outside your clinic');
      }
    }

    // Soft delete by setting status to 'deleted'
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .update({ status: 'deleted' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting user:', error);
      throw new InternalServerErrorException(
        `Failed to delete user: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true, data };
  }

  async getCurrentUserProfile(user: any) {
    if (!user || !user.user_id) {
      throw new NotFoundException('User not found');
    }

    // Use user_id (users table id) instead of id (auth_user_id)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select(`
        id,
        role,
        role_id,
        role_name,
        organization_id,
        clinic_id,
        has_set_password,
        full_name,
        role_permissions:user_roles!role_id(id, admin_controls, view_access, create_access, edit_access, cancel_access, delete_access)
      `)
      .eq('id', user.user_id)
      .single();

    if (error) throw new NotFoundException(`User profile not found`);
    return data;
  }

  /**
   * Get users by organization (excluding clients)
   */
  async findByOrganization(user: UserContext) {
    if (!user.organization_id) {
      return [];
    }

    // Fetch IDs of users who are already clients in the organization
    const { data: clientUsers, error: clientUsersError } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('user_id')
      .eq('organization_id', user.organization_id);

    if (clientUsersError) {
      console.error('Error fetching client users:', clientUsersError);
      throw new InternalServerErrorException('Failed to fetch client users');
    }

    const clientUserIds = (clientUsers || []).map((client: any) => client.user_id).filter(Boolean);

    const userQuery = `
      id,
      auth_user_id,
      email,
      full_name,
      first_name,
      last_name,
      role,
      role_id,
      role_name,
      organization_id,
      clinic_id,
      status,
      created_at,
      has_set_password,
      organizations!users_organization_id_fkey(id, name),
      clinics!users_clinic_id_fkey(id, name)
    `;

    let query = this.supabaseService
      .getClient()
      .from('users')
      .select(userQuery)
      .eq('organization_id', user.organization_id)
      .neq('role', 'client'); // Exclude clients

    // Exclude users who are already clients
    if (clientUserIds.length > 0) {
      query = query.not('id', 'in', `(${clientUserIds.join(',')})`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users by organization:', error);
      throw new InternalServerErrorException(
        `Failed to fetch users: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Bulk delete users (soft delete - sets status to 'deleted')
   */
  async bulkRemove(userIds: string[], user: UserContext) {
    const results: Array<{ id: string; success: boolean }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of userIds) {
      try {
        await this.remove(id, user);
        results.push({ id, success: true });
      } catch (error) {
        errors.push({ id, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return {
      success: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Bulk update users
   */
  async bulkUpdate(userIds: string[], updateData: UpdateUserDto, user: UserContext) {
    const results: Array<{ id: string; success: boolean; data?: any }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of userIds) {
      try {
        const updated = await this.update(id, updateData, user);
        results.push({ id, success: true, data: updated });
      } catch (error) {
        errors.push({ id, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return {
      success: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Get user schedules for a clinic
   */
  async getUserSchedules(clinicId: string, user: UserContext) {
    // Validate access to clinic
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any clinic in their organization
        // We'd need to verify clinic belongs to org, but for now allow
      } else if (user.clinic_id !== clinicId) {
        throw new ForbiddenException('Access denied: Cannot access schedules for other clinics');
      }
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select(`
        id,
        auth_user_id,
        full_name,
        email,
        role,
        role_name,
        organization_id,
        clinic_id,
        status,
        created_at,
        timezone,
        schedules:user_schedules(*)
      `)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .neq('status', 'deleted')
      .neq('role', 'client')
      .neq('role', 'super_admin')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching user schedules:', error);
      throw new InternalServerErrorException(
        `Failed to fetch user schedules: ${error.message || 'Unknown error'}`,
      );
    }

    // Transform data to use role_name if available
    const transformedData = (data || []).map((userData: any) => {
      const originalRole = userData.role;
      let displayRole = userData.role || 'N/A';

      if (userData.role_name) {
        displayRole = userData.role_name;
      } else {
        const roleFormats: Record<string, string> = {
          'super_admin': 'Super Admin',
          'org_admin': 'Organization Admin',
          'clinic_admin': 'Clinic Admin',
          'veterinarian': 'Veterinarian',
          'staff': 'Staff',
          'client': 'Client',
        };
        displayRole = roleFormats[userData.role] || userData.role;
      }

      return {
        ...userData,
        role: displayRole,
        originalRole,
      };
    });

    return transformedData;
  }

  /**
   * Create a user schedule
   */
  async createUserSchedule(userId: string, scheduleData: any, user: UserContext) {
    // Validate access to user
    const targetUser = await this.findOne(userId, user);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_schedules')
      .insert({
        ...scheduleData,
        user_id: userId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating user schedule:', error);
      throw new InternalServerErrorException(
        `Failed to create user schedule: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  /**
   * Update a user schedule
   */
  async updateUserSchedule(scheduleId: string, scheduleData: any, user: UserContext) {
    // First get the schedule to validate access
    const { data: schedule, error: scheduleError } = await this.supabaseService
      .getClient()
      .from('user_schedules')
      .select('user_id')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      throw new NotFoundException(`Schedule with id ${scheduleId} not found`);
    }

    // Validate access to the user who owns this schedule
    await this.findOne(schedule.user_id, user);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_schedules')
      .update(scheduleData)
      .eq('id', scheduleId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating user schedule:', error);
      throw new InternalServerErrorException(
        `Failed to update user schedule: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }
}

