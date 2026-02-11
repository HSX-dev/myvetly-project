import { Injectable, NotFoundException, InternalServerErrorException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
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
   * Get all users including deleted ones with RLS filtering
   */
  async findAllIncludingDeleted(user: UserContext) {
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
      deleted_at,
      deleted_by,
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
      console.error('Error fetching users including deleted:', error);
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
   * Get user by auth_user_id (for fallback authentication)
   * This is used when the main /me endpoint fails
   */
  async findByAuthUserId(authUserId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, role, organization_id, clinic_id, full_name')
      .eq('auth_user_id', authUserId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`User with auth_user_id ${authUserId} not found`);
      }
      throw new InternalServerErrorException(`Failed to fetch user: ${error.message || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Create a new user with auth user creation and invitation email
   * This replaces the Edge Function functionality in the backend
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

    // Handle name fields - construct full_name if not provided (matching original Edge Function behavior)
    const updateData = { ...createUserDto };
    if (!updateData.full_name && (updateData.first_name || updateData.last_name)) {
      // Match original Edge Function: [first_name, last_name].filter(Boolean).join(' ').trim()
      const nameParts = [updateData.first_name, updateData.last_name].filter(Boolean);
      updateData.full_name = nameParts.length > 0 ? nameParts.join(' ').trim() : undefined;
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

    // Step 1: Create auth user using Supabase Admin API
    let authUserId: string;
    let alreadyExisted = false;

    try {
      // Try to create new auth user
      // If user already exists, we'll catch the error and handle it
      const { data: newAuthUser, error: authError } = await this.supabaseService
        .getClient()
        .auth.admin.createUser({
          email: createUserDto.email,
          password: createUserDto.password || undefined,
          email_confirm: !createUserDto.inviteOnly, // Auto-confirm if password provided
          user_metadata: {
            first_name: updateData.first_name,
            last_name: updateData.last_name,
          },
        });

      if (authError) {
        // Check if error is due to user already existing
        const errorMessage = authError.message?.toLowerCase() || '';
        const isDuplicateEmail = 
          errorMessage.includes('already registered') || 
          errorMessage.includes('already exists') ||
          errorMessage.includes('user already registered') ||
          errorMessage.includes('email address has already been registered') ||
          errorMessage.includes('duplicate') ||
          authError.status === 422; // Supabase returns 422 for duplicate emails

        if (isDuplicateEmail) {
          // Check if user already exists in users table
          const { data: existingUserRecord } = await this.supabaseService
            .getClient()
            .from('users')
            .select('id, email, role, status, clinic_id, organization_id, auth_user_id')
            .eq('email', createUserDto.email)
            .neq('role', 'client') // Exclude clients
            .maybeSingle();

          if (existingUserRecord) {
            // Check if user is complete and active (matching original frontend logic)
            const isCompleteActiveUser = 
              existingUserRecord.role && 
              existingUserRecord.clinic_id && 
              existingUserRecord.status === 'active' && 
              existingUserRecord.auth_user_id;
            
            if (isCompleteActiveUser) {
              // User already exists and is complete/active - return 409 Conflict
              throw new ConflictException(
                `A user with email ${createUserDto.email} already exists in the system`,
              );
            }
            // If user is incomplete or inactive, continue to update it
          }

          // User already exists, try to get their ID by attempting to invite them
          // This will return the existing user
          const { data: existingUserData, error: inviteError } = await this.supabaseService
            .getClient()
            .auth.admin.inviteUserByEmail(createUserDto.email);

          if (inviteError || !existingUserData?.user?.id) {
            // If we can't get the user, try listing users (with pagination for efficiency)
            const { data: usersList } = await this.supabaseService
              .getClient()
              .auth.admin.listUsers({ page: 1, perPage: 1000 });

            const existingUser = usersList?.users?.find(
              (u: any) => u.email === createUserDto.email,
            );

            if (existingUser) {
              authUserId = existingUser.id;
              alreadyExisted = true;
              console.log('Auth user already exists:', authUserId);
            } else {
              // If we can't find the user but they exist, return 409 Conflict
              throw new ConflictException(
                `A user with email ${createUserDto.email} already exists`,
              );
            }
          } else {
            authUserId = existingUserData.user.id;
            alreadyExisted = true;
            console.log('Auth user already exists:', authUserId);
          }
        } else {
          // For other auth errors, check if they're client errors (4xx) or server errors (5xx)
          // Invalid email format, missing required fields, etc. should be 400 Bad Request
          if (authError.status && authError.status >= 400 && authError.status < 500) {
            throw new BadRequestException(
              `Failed to create auth user: ${authError.message}`,
            );
          } else {
            // Only throw 500 for actual server errors
            throw new InternalServerErrorException(
              `Failed to create auth user: ${authError.message}`,
            );
          }
        }
      } else {
        // User created successfully
        if (!newAuthUser?.user?.id) {
          throw new InternalServerErrorException('Failed to create auth user: No user ID returned');
        }

        authUserId = newAuthUser.user.id;

        // Send invitation email if inviteOnly is true
        if (createUserDto.inviteOnly && !createUserDto.password) {
          // Use inviteUserByEmail to send invitation email
          const { data: inviteData, error: inviteError } = await this.supabaseService
            .getClient()
            .auth.admin.inviteUserByEmail(createUserDto.email, {
              data: {
                first_name: updateData.first_name,
                last_name: updateData.last_name,
              },
            });

          if (inviteError) {
            console.warn('Failed to send invitation email:', inviteError);
            // Don't throw - user was created successfully, email can be sent later
          } else {
            console.log('Invitation email sent successfully');
          }
        }
      }
    } catch (error: any) {
      console.error('Error creating auth user:', error);
      // Preserve HTTP exceptions (4xx, 5xx) - don't convert them
      if (error instanceof ConflictException || 
          error instanceof BadRequestException || 
          error instanceof ForbiddenException ||
          error instanceof NotFoundException ||
          error instanceof InternalServerErrorException) {
        throw error;
      }
      // For unknown errors, check if they're client errors based on status code
      if (error?.status && error.status >= 400 && error.status < 500) {
        throw new BadRequestException(
          `Failed to create auth user: ${error.message || 'Unknown error'}`,
        );
      }
      // Only throw 500 for actual server errors
      throw new InternalServerErrorException(
        `Failed to create auth user: ${error.message || 'Unknown error'}`,
      );
    }

    // Step 2: Check if user record already exists in users table
    const { data: existingUserRecord, error: checkError } = await this.supabaseService
      .getClient()
      .from('users')
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
        timezone,
        created_at,
        has_set_password,
        organizations!users_organization_id_fkey(id, name),
        clinics!users_clinic_id_fkey(id, name)
      `)
      .eq('auth_user_id', authUserId)
      .single();

    if (existingUserRecord) {
      // User record already exists
      console.log('User record already exists:', existingUserRecord.id);
      
      // Check if user is complete and active (matching original frontend logic)
      // If user is complete/active, return 409 Conflict instead of updating
      const isCompleteActiveUser = 
        existingUserRecord.role && 
        existingUserRecord.clinic_id && 
        existingUserRecord.status === 'active' && 
        existingUserRecord.auth_user_id;
      
      if (isCompleteActiveUser) {
        // User already exists and is complete/active - return 409 Conflict
        throw new ConflictException(
          `A user with email ${createUserDto.email} already exists in the system`,
        );
      }
      
      // User exists but is incomplete or inactive - update it
      // Update name fields if provided in request and they differ from existing record
      const needsUpdate: any = {};
      if (updateData.first_name && updateData.first_name !== existingUserRecord.first_name) {
        needsUpdate.first_name = updateData.first_name;
      }
      if (updateData.last_name && updateData.last_name !== existingUserRecord.last_name) {
        needsUpdate.last_name = updateData.last_name;
      }
      
      // Reconstruct full_name from first_name and last_name (matching original Edge Function behavior)
      const finalFirstName = needsUpdate.first_name || existingUserRecord.first_name || updateData.first_name;
      const finalLastName = needsUpdate.last_name || existingUserRecord.last_name || updateData.last_name;
      const nameParts = [finalFirstName, finalLastName].filter(Boolean);
      const constructedFullName = nameParts.length > 0 ? nameParts.join(' ').trim() : undefined;
      
      if (constructedFullName && constructedFullName !== existingUserRecord.full_name) {
        needsUpdate.full_name = constructedFullName;
      }
      
      // Update timezone if provided and different
      if (updateData.timezone && updateData.timezone !== existingUserRecord.timezone) {
        needsUpdate.timezone = updateData.timezone;
      }
      
      // Update role_id and role_name if provided
      if (updateData.role_id !== undefined && updateData.role_id !== existingUserRecord.role_id) {
        needsUpdate.role_id = updateData.role_id;
      }
      if (updateData.role_name !== undefined && updateData.role_name !== existingUserRecord.role_name) {
        needsUpdate.role_name = updateData.role_name;
      }
      
      // Update clinic_id and organization_id if provided and different (important for user to show in list)
      if (updateData.clinic_id !== undefined && updateData.clinic_id !== existingUserRecord.clinic_id) {
        needsUpdate.clinic_id = updateData.clinic_id;
      }
      if (updateData.organization_id !== undefined && updateData.organization_id !== existingUserRecord.organization_id) {
        needsUpdate.organization_id = updateData.organization_id;
      }
      
      // Update role if provided and different
      if (updateData.role && updateData.role !== existingUserRecord.role) {
        needsUpdate.role = updateData.role;
      }
      
      // Update status if provided and different
      if (updateData.status && updateData.status !== existingUserRecord.status) {
        needsUpdate.status = updateData.status;
      }
      
      // Always update auth_user_id if it's missing or different
      if (!existingUserRecord.auth_user_id || existingUserRecord.auth_user_id !== authUserId) {
        needsUpdate.auth_user_id = authUserId;
      }
      
      // Update the record if there are changes
      if (Object.keys(needsUpdate).length > 0) {
        const { data: updatedRecord, error: updateError } = await this.supabaseService
          .getClient()
          .from('users')
          .update(needsUpdate)
          .eq('id', existingUserRecord.id)
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
        
        if (updateError) {
          console.warn('Failed to update existing user record:', updateError);
          throw new InternalServerErrorException(
            `Failed to update existing user record: ${updateError.message}`,
          );
        } else if (updatedRecord) {
          return {
            ...updatedRecord,
            already_existed: true,
            auth_user_id: authUserId,
          };
        }
      }
      
      // Return existing record with corrected full_name in response if it was wrong
      const responseFullName = constructedFullName || existingUserRecord.full_name;
      
      return {
        ...existingUserRecord,
        full_name: responseFullName,
        already_existed: true,
        auth_user_id: authUserId,
      };
    }

    // Step 3: Create user record in users table (only if it doesn't exist)
    // Explicitly exclude password and inviteOnly (these are not database columns)
    // Note: confirm_password is not in updateData, so we only exclude password and inviteOnly
    const { password, inviteOnly, ...userRecordData } = updateData;
    
    const finalUserRecordData = {
      ...userRecordData,
      auth_user_id: authUserId,
      has_set_password: !!createUserDto.password,
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .insert(finalUserRecordData)
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
      console.error('Error creating user record:', error);
      
      // Check if error is due to duplicate email
      if (error.code === '23505' && (error.message?.includes('email') || error.message?.includes('users_email_key'))) {
        throw new ConflictException(
          `A user with email ${createUserDto.email} already exists in the system`,
        );
      }
      
      // Check if error is due to duplicate key (race condition)
      if (error.code === '23505' && error.message?.includes('auth_user_id')) {
        // User record was created by another request, fetch it
        const { data: raceConditionUser } = await this.supabaseService
          .getClient()
          .from('users')
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
          .eq('auth_user_id', authUserId)
          .single();

        if (raceConditionUser) {
          return {
            ...raceConditionUser,
            already_existed: true,
            auth_user_id: authUserId,
          };
        }
      }

      // If user record creation fails, try to clean up auth user (optional)
      if (!alreadyExisted) {
        try {
          await this.supabaseService.getClient().auth.admin.deleteUser(authUserId);
        } catch (cleanupError) {
          console.error('Failed to cleanup auth user:', cleanupError);
        }
      }
      throw new InternalServerErrorException(
        `Failed to create user record: ${error.message || 'Unknown error'}`,
      );
    }

    return {
      ...data,
      already_existed: alreadyExisted,
      auth_user_id: authUserId,
    };
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
   * Update user password via Supabase Auth Admin API
   * This replaces the Edge Function approach
   */
  async updatePassword(id: string, newPassword: string, user: UserContext) {
    console.log('🔐 updatePassword called:', { userId: id, currentUser: user.id, role: user.role });

    // First, get the target user to validate access and get auth_user_id
    let targetUser;
    try {
      targetUser = await this.findOne(id, user);
      console.log('✅ Target user found:', { id: targetUser.id, auth_user_id: targetUser.auth_user_id });
    } catch (error) {
      console.error('❌ Failed to find target user:', error);
      throw error; // Re-throw to preserve the original error (RLS/not found)
    }

    if (!targetUser.auth_user_id) {
      console.error('❌ User record exists but auth_user_id is missing:', { userId: id });
      throw new NotFoundException('User auth_user_id not found - user may not have an auth account');
    }

    // Validate password length
    if (newPassword.length < 8) {
      throw new InternalServerErrorException('Password must be at least 8 characters long');
    }

    // Update password via Supabase Auth Admin API
    console.log('🔄 Updating password via Supabase Auth Admin API...');
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.updateUserById(targetUser.auth_user_id, {
        password: newPassword,
      });

    if (error) {
      console.error('❌ Error updating user password via Supabase Auth:', error);
      throw new InternalServerErrorException(
        `Failed to update password: ${error.message || 'Unknown error'}`,
      );
    }

    console.log('✅ Password updated in Supabase Auth, updating has_set_password flag...');

    // Update has_set_password flag in users table
    await this.supabaseService
      .getClient()
      .from('users')
      .update({ has_set_password: true })
      .eq('id', id);

    console.log('✅ Password update completed successfully');

    return {
      success: true,
      message: 'Password updated successfully',
    };
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

  /**
   * Restore a soft-deleted user (change status from 'deleted' to 'active')
   */
  async restore(id: string, user: UserContext) {
    // First, get the target user to validate access
    const targetUser = await this.findOne(id, user);

    // RLS Validation: Check if user can restore this specific user
    if (user.role === 'super_admin') {
      // Super admin can restore any user
    } else if (user.role === 'org_admin') {
      // Org admin can only restore users in their organization
      if (targetUser.organization_id !== user.organization_id) {
        throw new ForbiddenException('Access denied: Cannot restore users outside your organization');
      }
    } else {
      // Clinic admin and below can only restore users in their clinic
      if (targetUser.organization_id !== user.organization_id || 
          targetUser.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot restore users outside your clinic');
      }
    }

    // Restore by setting status to 'active' and clearing deleted fields
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .update({ 
        status: 'active',
        deleted_at: null,
        deleted_by: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error restoring user:', error);
      throw new InternalServerErrorException(
        `Failed to restore user: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true, data };
  }

  /**
   * Permanently delete a user (hard delete)
   * WARNING: This permanently removes the user from the database
   */
  async hardDelete(id: string, user: UserContext) {
    // First, get the target user to validate access
    const targetUser = await this.findOne(id, user);

    // Prevent self-deletion
    if (targetUser.auth_user_id === user.auth_user_id) {
      throw new ForbiddenException('Cannot permanently delete your own account');
    }

    // RLS Validation: Check if user can permanently delete this specific user
    if (user.role === 'super_admin') {
      // Super admin can delete any user
    } else if (user.role === 'org_admin') {
      // Org admin can only delete users in their organization
      if (targetUser.organization_id !== user.organization_id) {
        throw new ForbiddenException('Access denied: Cannot permanently delete users outside your organization');
      }
    } else {
      // Clinic admin and below can only delete users in their clinic
      if (targetUser.organization_id !== user.organization_id || 
          targetUser.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot permanently delete users outside your clinic');
      }
    }

    // Hard delete - permanently remove from database
    const { error } = await this.supabaseService
      .getClient()
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting user:', error);
      throw new InternalServerErrorException(
        `Failed to permanently delete user: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true };
  }

  /**
   * Get all states
   */
  async getStates() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('states')
      .select('id, code, name')
      .order('name');

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch states: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get licensed states for a user
   */
  async getUserLicensedStates(userId: string, user: UserContext) {
    // Validate access - users can only see their own licensed states, or admins can see any
    if (user.role !== 'super_admin' && user.user_id !== userId) {
      // Check if user is in same organization/clinic
      const { data: targetUser } = await this.supabaseService
        .getClient()
        .from('users')
        .select('organization_id, clinic_id')
        .eq('id', userId)
        .single();

      if (!targetUser) {
        throw new NotFoundException(`User with id ${userId} not found`);
      }

      if (user.role === 'org_admin') {
        if (targetUser.organization_id !== user.organization_id) {
          throw new ForbiddenException('Access denied');
        }
      } else if (user.clinic_id !== targetUser.clinic_id || user.organization_id !== targetUser.organization_id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_licensed_states')
      .select(`
        id,
        user_id,
        state_id,
        state_code,
        created_at,
        state:states(id, code, name)
      `)
      .eq('user_id', userId)
      .order('created_at');

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch licensed states: ${error.message}`);
    }

    // Add state_code with fallback to state.code
    return (data || []).map((item: any) => ({
      ...item,
      state_code: item.state_code || item.state?.code || null,
    }));
  }

  /**
   * Update licensed states for a user (replaces all existing states)
   */
  async updateUserLicensedStates(userId: string, stateIds: string[], user: UserContext) {
    // Validate access - users can only update their own licensed states, or admins can update any
    if (user.role !== 'super_admin' && user.user_id !== userId) {
      // Check if user is in same organization/clinic
      const { data: targetUser } = await this.supabaseService
        .getClient()
        .from('users')
        .select('organization_id, clinic_id')
        .eq('id', userId)
        .single();

      if (!targetUser) {
        throw new NotFoundException(`User with id ${userId} not found`);
      }

      if (user.role === 'org_admin') {
        if (targetUser.organization_id !== user.organization_id) {
          throw new ForbiddenException('Access denied');
        }
      } else if (user.clinic_id !== targetUser.clinic_id || user.organization_id !== targetUser.organization_id) {
        throw new ForbiddenException('Access denied');
      }
    }

    // Delete all existing licensed states for the user
    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('user_licensed_states')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      throw new InternalServerErrorException(`Failed to delete existing licensed states: ${deleteError.message}`);
    }

    // Insert new licensed states if any
    if (stateIds.length > 0) {
      const newStates = stateIds.map(stateId => ({
        user_id: userId,
        state_id: stateId,
      }));

      const { error: insertError } = await this.supabaseService
        .getClient()
        .from('user_licensed_states')
        .insert(newStates);

      if (insertError) {
        throw new InternalServerErrorException(`Failed to insert licensed states: ${insertError.message}`);
      }
    }

    return { success: true };
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
   * Get veterinarians for a clinic
   * Returns users with role 'veterinarian' or 'staff', or custom roles containing vet-related terms
   */
  async getVeterinarians(clinicId: string, user: UserContext) {
    // Validate access to clinic
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any clinic in their organization
        // We'd need to verify clinic belongs to org, but for now allow
      } else if (user.clinic_id !== clinicId) {
        throw new ForbiddenException('Access denied: Cannot access veterinarians for other clinics');
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
        schedules:user_schedules(*)
      `)
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .neq('id', 'e9dfaf62-0b3f-4d3d-aa93-652473c0a78c')
      .order('full_name');

    if (error) {
      console.error('Error fetching veterinarians:', error);
      throw new InternalServerErrorException(
        `Failed to fetch veterinarians: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) return [];

    // Filter to include veterinarians, staff, and custom roles like "Televet"
    const veterinarianRoles = ['veterinarian', 'staff', 'televet'];
    const filtered = data.filter((userData: any) => {
      const baseRole = userData.role?.toLowerCase();
      const roleName = userData.role_name?.toLowerCase();
      
      // Check base role
      if (veterinarianRoles.includes(baseRole || '')) {
        return true;
      }
      
      // Check custom role names (like "Televet", "Technician")
      if (roleName) {
        // Include roles that contain veterinarian-related terms
        const vetTerms = ['veterinarian', 'vet', 'televet'];
        return vetTerms.some(term => roleName.includes(term));
      }
      
      return false;
    });

    return filtered;
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

