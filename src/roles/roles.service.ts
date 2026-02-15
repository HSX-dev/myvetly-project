import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClinicUserRoleDto } from './dto/create-clinic-user-role.dto';
import { UpdateClinicUserRoleDto } from './dto/update-clinic-user-role.dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class RolesService {
  constructor(private supabaseService: SupabaseService) {}

  // Admin Roles (admin_roles table) methods
  async findAllAdminRoles() {
    console.log('[findAllAdminRoles] Fetching all admin roles from admin_roles table...');
    
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('[findAllAdminRoles] Error fetching all admin roles:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The admin_roles table does not exist in the database. Please create the table.',
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch admin roles: ${error.message || 'Unknown error'}`,
      );
    }

    const roles = data || [];
    console.log(`[findAllAdminRoles] Found ${roles.length} admin roles. IDs:`, 
      roles.map(r => ({ 
        id: r.id, 
        idType: typeof r.id,
        idLength: r.id?.length,
        idJSON: JSON.stringify(r.id),
        name: r.name 
      }))
    );

    return roles;
  }

  async findOneAdminRole(id: string) {
    if (!id || id.trim() === '') {
      throw new BadRequestException('Admin role id is required');
    }

    const trimmedId = id.trim();
    console.log(`[findOneAdminRole] Searching for admin role with id: "${trimmedId}" (length: ${trimmedId.length})`);

    // First, let's see what roles exist in the database
    const { data: allRoles, error: listError } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('id, name, slug, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (listError) {
      console.error('[findOneAdminRole] Error listing all roles:', listError);
    } else {
      console.log(`[findOneAdminRole] Found ${allRoles?.length || 0} admin roles in database:`, 
        allRoles?.map(r => ({ id: r.id, name: r.name, idLength: r.id?.length }))
      );
      
      // Check if the ID exists in the list (case-insensitive comparison)
      const foundInList = allRoles?.find(r => 
        r.id === trimmedId || 
        r.id?.toLowerCase() === trimmedId.toLowerCase() ||
        r.id?.trim() === trimmedId
      );
      
      if (foundInList) {
        console.log(`[findOneAdminRole] ID found in list but query failed. Found role:`, foundInList);
      }
    }

    // Try exact match first
    console.log(`[findOneAdminRole] Executing query: .eq('id', '${trimmedId}')`);
    let { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('*')
      .eq('id', trimmedId)
      .maybeSingle();

    console.log(`[findOneAdminRole] Query result:`, { 
      hasData: !!data, 
      hasError: !!error, 
      errorCode: error?.code,
      errorMessage: error?.message,
      dataId: data?.id,
      dataName: data?.name
    });

    // If not found, try to query without .maybeSingle() to see if multiple rows exist
    if (!data && !error) {
      console.log('[findOneAdminRole] No data returned, checking if multiple rows exist...');
      const { data: allMatching, error: allError } = await this.supabaseService
        .getClient()
        .from('admin_roles')
        .select('*')
        .eq('id', trimmedId);
      
      console.log(`[findOneAdminRole] Query without maybeSingle returned:`, {
        count: allMatching?.length || 0,
        hasError: !!allError,
        errorMessage: allError?.message
      });
      
      if (allMatching && allMatching.length > 0) {
        console.log('[findOneAdminRole] Found matching rows:', allMatching.map(r => ({ id: r.id, name: r.name })));
        return allMatching[0]; // Return first match
      }
    }

    if (error) {
      console.error('[findOneAdminRole] Error fetching admin role:', error);
      throw new InternalServerErrorException(
        `Failed to fetch admin role: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      console.error(`[findOneAdminRole] Admin role with id "${trimmedId}" not found after query.`);
      console.error(`[findOneAdminRole] Available role IDs:`, allRoles?.map(r => r.id));
      throw new NotFoundException(`Admin role with id ${trimmedId} not found`);
    }

    console.log(`[findOneAdminRole] Found admin role:`, { id: data.id, name: data.name, slug: data.slug });
    return data;
  }

  async createAdminRole(roleData: any) {
    // Validate required fields
    if (!roleData.name || roleData.name.trim() === '') {
      throw new BadRequestException('name is required');
    }

    // Generate slug from name if not provided
    if (!roleData.slug || roleData.slug.trim() === '') {
      roleData.slug = roleData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Filter out invalid fields that don't exist in admin_roles table
    // Based on schema: id, name, description, slug, created_at, updated_at
    const allowedFields = ['name', 'description', 'slug'];
    const filteredData: any = {};
    
    for (const field of allowedFields) {
      if (roleData[field] !== undefined) {
        filteredData[field] = roleData[field];
      }
    }

    // Ensure name and slug are set
    filteredData.name = roleData.name.trim();
    filteredData.slug = roleData.slug.trim();

    console.log('[createAdminRole] Inserting admin role with data:', filteredData);

    // Insert and return the created record
    const { data: insertData, error: insertError } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .insert(filteredData)
      .select('*');

    if (insertError) {
      console.error('[createAdminRole] Error creating admin role:', insertError);
      
      // Check if table doesn't exist
      if (insertError.message?.includes('relation') && insertError.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The admin_roles table does not exist in the database. Please create the table.',
        );
      }
      
      // Check for constraint violations (e.g., unique constraint on slug)
      if (insertError.code === '23505' || insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
        throw new BadRequestException(
          `Failed to create admin role: A role with this name or slug already exists.`,
        );
      }
      
      // Check for NOT NULL constraint violations
      if (insertError.code === '23502' || insertError.message?.includes('null value') || insertError.message?.includes('violates not-null')) {
        const missingField = insertError.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
        throw new BadRequestException(
          `Failed to create admin role: The field '${missingField}' is required but was not provided.`,
        );
      }
      
      // Check for invalid column errors
      if (insertError.message?.includes('column') && insertError.message?.includes('does not exist')) {
        const invalidField = insertError.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
        throw new BadRequestException(
          `Failed to create admin role: The field '${invalidField}' does not exist in the admin_roles table.`,
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to create admin role: ${insertError.message || 'Unknown error'}`,
      );
    }

    // If insert succeeded but no data returned, try to fetch it by slug
    if (!insertData || insertData.length === 0) {
      console.warn('[createAdminRole] Insert succeeded but no data returned, trying to fetch by slug...');
      const { data: fetchedData, error: fetchError } = await this.supabaseService
        .getClient()
        .from('admin_roles')
        .select('*')
        .eq('slug', filteredData.slug)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('[createAdminRole] Error fetching created admin role:', fetchError);
        throw new InternalServerErrorException(
          `Admin role was created but could not be retrieved: ${fetchError.message || 'Unknown error'}`,
        );
      }

      if (!fetchedData) {
        throw new InternalServerErrorException(
          'Admin role was created but could not be retrieved. Please try fetching it by listing all admin roles.',
        );
      }

      console.log('[createAdminRole] Fetched admin role by slug:', { id: fetchedData.id, name: fetchedData.name });
      return fetchedData;
    }

    // Return the first (and should be only) inserted record
    const createdRole = insertData[0];
    console.log('[createAdminRole] Created admin role:', { id: createdRole.id, name: createdRole.name, slug: createdRole.slug });
    return createdRole;
  }

  async updateAdminRole(id: string, roleData: any) {
    if (!id || id.trim() === '') {
      throw new BadRequestException('Admin role id is required');
    }

    const trimmedId = id.trim();
    console.log(`[updateAdminRole] Updating admin role with id: "${trimmedId}" (length: ${trimmedId.length})`);

    // First, verify the role exists
    const { data: existingRole, error: findError } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('id, name')
      .eq('id', trimmedId)
      .maybeSingle();

    if (findError) {
      console.error('[updateAdminRole] Error finding admin role:', findError);
      throw new InternalServerErrorException(
        `Failed to find admin role: ${findError.message || 'Unknown error'}`,
      );
    }

    if (!existingRole) {
      // List all roles for debugging
      const { data: allRoles } = await this.supabaseService
        .getClient()
        .from('admin_roles')
        .select('id, name, slug')
        .limit(20);
      
      console.log(`[updateAdminRole] Admin role with id "${trimmedId}" not found. Available roles:`, 
        allRoles?.map(r => ({ id: r.id, name: r.name }))
      );
      
      throw new NotFoundException(`Admin role with id ${trimmedId} not found`);
    }

    console.log(`[updateAdminRole] Found existing role:`, { id: existingRole.id, name: existingRole.name });

    // Filter out invalid fields
    const allowedFields = ['name', 'description', 'slug'];
    const filteredData: any = {};
    
    for (const field of allowedFields) {
      if (roleData[field] !== undefined) {
        filteredData[field] = roleData[field];
      }
    }

    // Update the role
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .update(filteredData)
      .eq('id', trimmedId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[updateAdminRole] Error updating admin role:', error);
      throw new InternalServerErrorException(
        `Failed to update admin role: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      console.error(`[updateAdminRole] Update succeeded but no data returned for id "${trimmedId}"`);
      throw new InternalServerErrorException(
        'Admin role was updated but could not be retrieved. Please try fetching it again.',
      );
    }

    console.log(`[updateAdminRole] Successfully updated admin role:`, { id: data.id, name: data.name });
    return data;
  }

  async deleteAdminRole(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  // System Roles (roles table) methods
  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching all roles:', error);
      
      // Check if table doesn't exist - fallback to admin_roles
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        console.warn('roles table not found, falling back to admin_roles...');
        const { data: adminRolesData, error: adminRolesError } = await this.supabaseService
          .getClient()
          .from('admin_roles')
          .select('*')
          .order('name', { ascending: true });

        if (!adminRolesError && adminRolesData) {
          console.warn('Returning admin_roles as fallback since roles table does not exist.');
          return adminRolesData;
        }

        // If admin_roles also fails, return empty array
        if (adminRolesError) {
          console.error('Error fetching admin_roles as fallback:', adminRolesError);
        }
        
        // Return empty array instead of throwing error to be more graceful
        return [];
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch roles: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Role with id ${id} not found`);
    return data;
  }

  async findByClinic(clinicId: string) {
    if (!clinicId || clinicId.trim() === '') {
      throw new BadRequestException('clinic_id is required');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching roles by clinic:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The roles table does not exist in the database. Please create the table.',
        );
      }
      
      // Check if column doesn't exist (maybe roles table doesn't have clinic_id)
      if (error.message?.includes('column') && error.message?.includes('clinic_id') && error.message?.includes('does not exist')) {
        // Try without clinic_id filter (maybe roles are global)
        const { data: allRoles, error: allRolesError } = await this.supabaseService
          .getClient()
          .from('roles')
          .select('*')
          .order('name', { ascending: true });

        if (!allRolesError) {
          return allRoles || [];
        }

        throw new BadRequestException(
          'The roles table does not have a clinic_id column. Roles may be global rather than clinic-specific.',
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch roles for clinic: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  // Clinic User Roles (user_roles table) methods
  async getClinicUserRolesByClinicId(clinicId: string, user: UserContext) {
    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== clinicId) {
      throw new ForbiddenException('Access denied: Cannot view roles for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select(`
        *,
        userCount: users!users_role_id_fkey(count)
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getClinicUserRole(roleId: string, user: UserContext) {
    if (!roleId || roleId.trim() === '') {
      throw new BadRequestException('Role id is required');
    }

    const trimmedId = roleId.trim();
    console.log(`[getClinicUserRole] Fetching user role with id: "${trimmedId}" (length: ${trimmedId.length})`);

    // Start with basic select to avoid relationship errors
    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select('*')
      .eq('id', trimmedId)
      .maybeSingle();

    console.log(`[getClinicUserRole] Query result:`, {
      hasData: !!data,
      hasError: !!error,
      errorCode: error?.code,
      errorMessage: error?.message
    });

    if (error) {
      console.error('[getClinicUserRole] Error fetching role:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The user_roles table does not exist in the database. Please create the table.',
        );
      }
      
      // Check if role not found (PGRST116)
      if (error.code === 'PGRST116') {
        // List all roles for debugging
        const { data: allRoles } = await this.supabaseService
          .getClient()
          .from('user_roles')
          .select('id, name, clinic_id')
          .limit(20);
        
        console.log(`[getClinicUserRole] Role with id "${trimmedId}" not found. Available roles:`, 
          allRoles?.map(r => ({ id: r.id, name: r.name, clinic_id: r.clinic_id }))
        );
        
        throw new NotFoundException(`Role with id ${trimmedId} not found`);
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch role: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      // List all roles for debugging
      const { data: allRoles } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .select('id, name, clinic_id')
        .limit(20);
      
      console.log(`[getClinicUserRole] Role with id "${trimmedId}" not found. Available roles:`, 
        allRoles?.map(r => ({ id: r.id, name: r.name, clinic_id: r.clinic_id }))
      );
      
      throw new NotFoundException(`Role with id ${trimmedId} not found`);
    }

    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== data.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot view role from other clinics');
    }

    console.log(`[getClinicUserRole] Found role:`, { id: data.id, name: data.name, clinic_id: data.clinic_id });
    return data;
  }

  async createClinicUserRole(createDto: CreateClinicUserRoleDto, user: UserContext) {
    // Validate required fields
    if (!createDto.name || createDto.name.trim() === '') {
      throw new BadRequestException('name is required');
    }

    if (!createDto.clinic_id || createDto.clinic_id.trim() === '') {
      throw new BadRequestException('clinic_id is required');
    }

    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== createDto.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot create roles for other clinics');
    }

    // Handle permissions array - if provided, use it for all access arrays
    const permissions = createDto.permissions || [];
    const adminControls = createDto.admin_controls || permissions;
    const viewAccess = createDto.view_access || permissions;
    const createAccess = createDto.create_access || permissions;
    const editAccess = createDto.edit_access || permissions;
    const cancelAccess = createDto.cancel_access || permissions;
    const deleteAccess = createDto.delete_access || permissions;

    // Determine user_id - user_roles.user_id references auth.users.id, not users.id
    // If provided in DTO, use it; otherwise use auth_user_id from user context
    const userId = createDto.user_id || user.auth_user_id;
    
    // Validate that the user_id exists in auth.users (if provided)
    if (userId) {
      // Note: We can't directly query auth.users via Supabase client,
      // but we can validate by checking if it's a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        throw new BadRequestException(
          `Invalid user_id format. user_id must be a valid UUID (auth.users.id).`,
        );
      }
    }

    // Auto-populate fields from user context
    const roleData: any = {
      name: createDto.name,
      description: createDto.description || '',
      status: createDto.status !== undefined ? createDto.status : true,
      admin_controls: adminControls,
      view_access: viewAccess,
      create_access: createAccess,
      edit_access: editAccess,
      cancel_access: cancelAccess,
      delete_access: deleteAccess,
      clinic_id: createDto.clinic_id,
      user_id: userId, // Use auth_user_id (auth.users.id) instead of user_id (users.id)
      created_by: createDto.created_by || user.user_id, // created_by can reference users.id
      assigned_by: createDto.assigned_by || user.user_id, // assigned_by can reference users.id
      organization_id: createDto.organization_id || user.organization_id,
    };

    // Add admin_role_id if provided
    if (createDto.admin_role_id) {
      roleData.admin_role_id = createDto.admin_role_id;
    }

    // Try with relationship first, fallback to basic insert if relationship doesn't exist
    let { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .insert(roleData)
      .select(`
        *,
        userCount: users!users_role_id_fkey(count)
      `)
      .single();

    // If relationship error, try without relationship
    if (error && (error.message?.includes('relationship') || error.message?.includes('does not exist'))) {
      console.warn('Relationship not found, falling back to basic insert:', error.message);
      const { data: basicData, error: basicError } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .insert(roleData)
        .select('*')
        .single();

      if (basicError) {
        console.error('Error creating clinic user role:', basicError);
        
        // Check if table doesn't exist
        if (basicError.message?.includes('relation') && basicError.message?.includes('does not exist')) {
          throw new BadRequestException(
            'The user_roles table does not exist in the database. Please create the table.',
          );
        }
        
        // Check for foreign key constraint violations
        if (basicError.code === '23503' || basicError.message?.includes('foreign key') || basicError.message?.includes('violates foreign key constraint')) {
          // Extract which foreign key failed
          let fieldName = 'unknown field';
          if (basicError.message?.includes('user_id')) {
            fieldName = 'user_id';
          } else if (basicError.message?.includes('clinic_id')) {
            fieldName = 'clinic_id';
          } else if (basicError.message?.includes('organization_id')) {
            fieldName = 'organization_id';
          } else if (basicError.message?.includes('created_by') || basicError.message?.includes('assigned_by')) {
            fieldName = basicError.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
          }
          
          throw new BadRequestException(
            `Failed to create clinic user role: The ${fieldName} value does not exist in the referenced table. Please ensure the ${fieldName} is valid.`,
          );
        }
        
        // Check for unique constraint violations
        if (basicError.code === '23505' || basicError.message?.includes('unique') || basicError.message?.includes('duplicate')) {
          throw new BadRequestException(
            `Failed to create clinic user role: A role with this name already exists for this clinic.`,
          );
        }
        
        // Check for NOT NULL constraint violations
        if (basicError.code === '23502' || basicError.message?.includes('null value') || basicError.message?.includes('violates not-null')) {
          const missingField = basicError.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
          throw new BadRequestException(
            `Failed to create clinic user role: The field '${missingField}' is required but was not provided.`,
          );
        }
        
        throw new InternalServerErrorException(
          `Failed to create clinic user role: ${basicError.message || 'Unknown error'}`,
        );
      }

      return basicData;
    }

    if (error) {
      console.error('Error creating clinic user role:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The user_roles table does not exist in the database. Please create the table.',
        );
      }
      
      // Check for foreign key constraint violations
      if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key constraint')) {
        // Extract which foreign key failed
        let fieldName = 'unknown field';
        if (error.message?.includes('user_id')) {
          fieldName = 'user_id';
        } else if (error.message?.includes('clinic_id')) {
          fieldName = 'clinic_id';
        } else if (error.message?.includes('organization_id')) {
          fieldName = 'organization_id';
        } else if (error.message?.includes('created_by') || error.message?.includes('assigned_by')) {
          fieldName = error.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
        }
        
        throw new BadRequestException(
          `Failed to create clinic user role: The ${fieldName} value does not exist in the referenced table. Please ensure the ${fieldName} is valid.`,
        );
      }
      
      // Check for unique constraint violations
      if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
        throw new BadRequestException(
          `Failed to create clinic user role: A role with this name already exists for this clinic.`,
        );
      }
      
      // Check for NOT NULL constraint violations
      if (error.code === '23502' || error.message?.includes('null value') || error.message?.includes('violates not-null')) {
        const missingField = error.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
        throw new BadRequestException(
          `Failed to create clinic user role: The field '${missingField}' is required but was not provided.`,
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to create clinic user role: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  async updateClinicUserRole(roleId: string, updateDto: UpdateClinicUserRoleDto, user: UserContext) {
    if (!roleId || roleId.trim() === '') {
      throw new BadRequestException('Role id is required');
    }

    const trimmedId = roleId.trim();
    console.log(`[updateClinicUserRole] Updating user role with id: "${trimmedId}" (length: ${trimmedId.length})`);

    // First get the role to check clinic_id
    const { data: role, error: fetchError } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select('id, clinic_id, name')
      .eq('id', trimmedId)
      .maybeSingle();

    if (fetchError) {
      console.error('[updateClinicUserRole] Error fetching role:', fetchError);
      
      // Check if table doesn't exist
      if (fetchError.message?.includes('relation') && fetchError.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The user_roles table does not exist in the database. Please create the table.',
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch role: ${fetchError.message || 'Unknown error'}`,
      );
    }

    if (!role) {
      // List all roles for debugging
      const { data: allRoles } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .select('id, name, clinic_id')
        .limit(20);
      
      console.log(`[updateClinicUserRole] Role with id "${trimmedId}" not found. Available roles:`, 
        allRoles?.map(r => ({ id: r.id, name: r.name, clinic_id: r.clinic_id }))
      );
      
      throw new NotFoundException(`Role with id ${trimmedId} not found`);
    }

    console.log(`[updateClinicUserRole] Found existing role:`, { id: role.id, name: role.name, clinic_id: role.clinic_id });

    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== role.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot update roles from other clinics');
    }

    // Filter out invalid fields
    const allowedFields = ['name', 'description', 'status', 'admin_controls', 'view_access', 'create_access', 'edit_access', 'cancel_access', 'delete_access', 'admin_role_id'];
    const filteredData: any = {};
    
    for (const field of allowedFields) {
      if (updateDto[field] !== undefined) {
        filteredData[field] = updateDto[field];
      }
    }

    // Update the role (without relationship query to avoid PGRST116)
    const { data: updateResult, error: updateError } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .update(filteredData)
      .eq('id', trimmedId)
      .select('*');

    if (updateError) {
      console.error('[updateClinicUserRole] Error updating role:', updateError);
      
      // Check if table doesn't exist
      if (updateError.message?.includes('relation') && updateError.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The user_roles table does not exist in the database. Please create the table.',
        );
      }
      
      // Check for foreign key constraint violations
      if (updateError.code === '23503' || updateError.message?.includes('foreign key') || updateError.message?.includes('violates foreign key constraint')) {
        const fieldName = updateError.message?.match(/column "(\w+)"/)?.[1] || 'unknown field';
        throw new BadRequestException(
          `Failed to update clinic user role: The ${fieldName} value does not exist in the referenced table.`,
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to update role: ${updateError.message || 'Unknown error'}`,
      );
    }

    // If update succeeded but no data returned, fetch it again
    if (!updateResult || updateResult.length === 0) {
      console.warn(`[updateClinicUserRole] Update succeeded but no data returned, fetching role again...`);
      
      const { data: fetchedData, error: fetchError } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .select('*')
        .eq('id', trimmedId)
        .maybeSingle();

      if (fetchError) {
        console.error('[updateClinicUserRole] Error fetching updated role:', fetchError);
        throw new InternalServerErrorException(
          `Role was updated but could not be retrieved: ${fetchError.message || 'Unknown error'}`,
        );
      }

      if (!fetchedData) {
        console.error(`[updateClinicUserRole] Update succeeded but role not found after update for id "${trimmedId}"`);
        throw new InternalServerErrorException(
          'Role was updated but could not be retrieved. Please try fetching it again.',
        );
      }

      console.log(`[updateClinicUserRole] Successfully updated and fetched role:`, { id: fetchedData.id, name: fetchedData.name });
      return fetchedData;
    }

    console.log(`[updateClinicUserRole] Successfully updated role:`, { id: updateResult[0].id, name: updateResult[0].name });
    return updateResult[0];
  }

  async deleteClinicUserRole(roleId: string, user: UserContext) {
    // First get the role to check clinic_id
    const { data: role, error: fetchError } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select('clinic_id')
      .eq('id', roleId)
      .single();

    if (fetchError) throw new NotFoundException(`Role with id ${roleId} not found`);

    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== role.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot delete roles from other clinics');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .delete()
      .eq('id', roleId);

    if (error) throw error;
    return { success: true };
  }
}

