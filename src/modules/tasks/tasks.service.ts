import { Injectable, NotFoundException, InternalServerErrorException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/index';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class TasksService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all tasks for a clinic with optional filters
   */
  async findAll(
    clinicId: string,
    user: UserContext,
    filters?: {
      assignedTo?: string;
      status?: string;
      scope?: 'all' | 'mine';
    }
  ) {
    // Validate clinic access
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any clinic in their organization
        // We'd need to verify clinic belongs to org, but for now allow
      } else if (user.clinic_id !== clinicId) {
        throw new ForbiddenException('Access denied: Cannot access tasks for other clinics');
      }
    }

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    let query = this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('clinic_id', clinicId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.assignedTo) {
      query = query.eq('assigned_to', filters.assignedTo);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.scope === 'mine' && user.user_id) {
      query = query.eq('assigned_to', user.user_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      throw new InternalServerErrorException(
        `Failed to fetch tasks: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      return [];
    }

    // Transform to match frontend DashboardTask format
    return data.map((task: any) => {
      // Handle assigned_user (can be array or single object)
      const assignedUser = Array.isArray(task.assigned_user)
        ? task.assigned_user[0]
        : task.assigned_user;
      
      // Handle client (can be array or single object or null)
      const client = task.client_id
        ? (Array.isArray(task.client) ? task.client[0] : task.client)
        : null;
      
      // Handle client user (can be array or single object or null)
      const clientUser = client?.users
        ? (Array.isArray(client.users) ? client.users[0] : client.users)
        : null;
      
      // Handle patient (can be array or single object or null)
      const patient = task.patient_id
        ? (Array.isArray(task.patient) ? task.patient[0] : task.patient)
        : null;

      // Helper to get initials
      const getInitials = (name: string): string => {
        return name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
      };

      return {
        id: task.id,
        title: task.title,
        client: clientUser?.full_name || 'No Client',
        pet: patient?.name || 'No Patient',
        dueDate: task.due_date,
        priority: task.priority as 'high' | 'medium' | 'low',
        status: task.status as 'open' | 'in_progress' | 'closed',
        assignedTo: assignedUser
          ? {
              id: assignedUser.id,
              full_name: assignedUser.full_name || 'Unknown User',
              initials: getInitials(assignedUser.full_name || 'Unknown User'),
            }
          : undefined,
      };
    });
  }

  /**
   * Get a single task by ID
   */
  async findOne(id: string, user: UserContext) {
    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Task with id ${id} not found`);
      }
      console.error('Error fetching task:', error);
      throw new InternalServerErrorException(
        `Failed to fetch task: ${error.message || 'Unknown error'}`,
      );
    }

    // Validate clinic access
    if (data && user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can access any task in their organization
        if (data.organization_id !== user.organization_id) {
          throw new ForbiddenException('Access denied: Cannot access tasks outside your organization');
        }
      } else if (data.clinic_id !== user.clinic_id) {
        throw new ForbiddenException('Access denied: Cannot access tasks outside your clinic');
      }
    }

    return data;
  }

  /**
   * Get tasks assigned to a user
   */
  async findByUser(userId: string, user: UserContext) {
    // Validate access - users can only see their own tasks or tasks in their clinic
    if (user.role !== 'super_admin' && userId !== user.user_id) {
      // If requesting another user's tasks, must be in same clinic
      if (user.clinic_id) {
        // We'd need to verify the target user is in the same clinic
        // For now, allow if requesting user is clinic_admin or above
        if (user.role !== 'org_admin' && user.role !== 'clinic_admin') {
          throw new ForbiddenException('Access denied: Cannot access other users\' tasks');
        }
      }
    }

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    let query = this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('assigned_to', userId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    // Apply clinic filter for non-super-admins
    if (user.role !== 'super_admin' && user.clinic_id) {
      query = query.eq('clinic_id', user.clinic_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks by user:', error);
      throw new InternalServerErrorException(
        `Failed to fetch tasks: ${error.message || 'Unknown error'}`,
      );
    }

    return data || [];
  }

  /**
   * Get tasks for a specific pet
   */
  async findByPet(petId: string, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this pet');
    }

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('patient_id', petId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks by pet:', error);
      throw new InternalServerErrorException(
        `Failed to fetch tasks: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      return [];
    }

    // Transform to match frontend DashboardTask format
    return data.map((task: any) => {
      // Handle assigned_user (can be array or single object)
      const assignedUser = Array.isArray(task.assigned_user)
        ? task.assigned_user[0]
        : task.assigned_user;
      
      // Handle client (can be array or single object or null)
      const client = task.client_id
        ? (Array.isArray(task.client) ? task.client[0] : task.client)
        : null;
      
      // Handle client user (can be array or single object or null)
      const clientUser = client?.users
        ? (Array.isArray(client.users) ? client.users[0] : client.users)
        : null;
      
      // Handle patient (can be array or single object or null)
      const patient = task.patient_id
        ? (Array.isArray(task.patient) ? task.patient[0] : task.patient)
        : null;

      // Helper to get initials
      const getInitials = (name: string): string => {
        return name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
      };

      return {
        id: task.id,
        title: task.title,
        client: clientUser?.full_name || 'No Client',
        pet: patient?.name || 'No Patient',
        dueDate: task.due_date,
        priority: task.priority as 'high' | 'medium' | 'low',
        status: task.status as 'open' | 'in_progress' | 'closed',
        assignedTo: assignedUser
          ? {
              id: assignedUser.id,
              full_name: assignedUser.full_name || 'Unknown User',
              initials: getInitials(assignedUser.full_name || 'Unknown User'),
            }
          : undefined,
      };
    });
  }

  /**
   * Get tasks for a specific client
   */
  async findByClient(clientId: string, user: UserContext) {
    // Validate user has access to this client's clinic
    const { data: client, error: clientError } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('clinic_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      throw new NotFoundException(`Client with id ${clientId} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && client.clinic_id && user.clinic_id !== client.clinic_id) {
      throw new ForbiddenException('Access denied: You do not have access to this client');
    }

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .select(taskQuery)
      .eq('client_id', clientId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks by client:', error);
      throw new InternalServerErrorException(
        `Failed to fetch tasks: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data) {
      return [];
    }

    // Transform to match frontend DashboardTask format
    return data.map((task: any) => {
      // Handle assigned_user (can be array or single object)
      const assignedUser = Array.isArray(task.assigned_user)
        ? task.assigned_user[0]
        : task.assigned_user;
      
      // Handle client (can be array or single object or null)
      const client = task.client_id
        ? (Array.isArray(task.client) ? task.client[0] : task.client)
        : null;
      
      // Handle client user (can be array or single object or null)
      const clientUser = client?.users
        ? (Array.isArray(client.users) ? client.users[0] : client.users)
        : null;
      
      // Handle patient (can be array or single object or null)
      const patient = task.patient_id
        ? (Array.isArray(task.patient) ? task.patient[0] : task.patient)
        : null;

      // Helper to get initials
      const getInitials = (name: string): string => {
        return name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
      };

      return {
        id: task.id,
        title: task.title,
        client: clientUser?.full_name || 'No Client',
        pet: patient?.name || 'No Patient',
        dueDate: task.due_date,
        priority: task.priority as 'high' | 'medium' | 'low',
        status: task.status as 'open' | 'in_progress' | 'closed',
        assignedTo: assignedUser
          ? {
              id: assignedUser.id,
              full_name: assignedUser.full_name || 'Unknown User',
              initials: getInitials(assignedUser.full_name || 'Unknown User'),
            }
          : undefined,
      };
    });
  }

  /**
   * Create a new task
   */
  async create(createTaskDto: CreateTaskDto, user: UserContext) {
    // Validate clinic access
    if (!user.clinic_id && user.role !== 'super_admin') {
      throw new ForbiddenException('Clinic ID is required');
    }

    const taskData = {
      ...createTaskDto,
      client_id: createTaskDto.client_id || null,
      patient_id: createTaskDto.patient_id || null,
      description: createTaskDto.description || null,
      clinic_id: user.clinic_id,
      organization_id: user.organization_id,
      created_by: user.user_id,
      status: createTaskDto.status || 'open',
      priority: createTaskDto.priority || 'medium',
    };

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .insert([taskData])
      .select(taskQuery)
      .single();

    if (error) {
      console.error('Error creating task:', error);
      throw new InternalServerErrorException(
        `Failed to create task: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  /**
   * Update a task
   */
  async update(id: string, updateTaskDto: UpdateTaskDto, user: UserContext) {
    // First, get the task to validate access
    const existingTask = await this.findOne(id, user);

    // Clean up empty strings to null for optional fields
    const updateData: any = {};
    if (updateTaskDto.title !== undefined) updateData.title = updateTaskDto.title;
    if (updateTaskDto.description !== undefined) updateData.description = updateTaskDto.description || null;
    if (updateTaskDto.status !== undefined) updateData.status = updateTaskDto.status;
    if (updateTaskDto.priority !== undefined) updateData.priority = updateTaskDto.priority;
    if (updateTaskDto.due_date !== undefined) updateData.due_date = updateTaskDto.due_date;
    if (updateTaskDto.assigned_to !== undefined) updateData.assigned_to = updateTaskDto.assigned_to;
    if (updateTaskDto.client_id !== undefined) updateData.client_id = updateTaskDto.client_id || null;
    if (updateTaskDto.patient_id !== undefined) updateData.patient_id = updateTaskDto.patient_id || null;

    const taskQuery = `
      id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_to,
      client_id,
      patient_id,
      clinic_id,
      organization_id,
      created_by,
      created_at,
      updated_at,
      assigned_user:users!assigned_to(
        id,
        full_name
      ),
      client:clients!client_id(
        id,
        user_id,
        users!user_id(
          id,
          full_name
        )
      ),
      patient:pets!patient_id(
        id,
        name
      )
    `;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select(taskQuery)
      .single();

    if (error) {
      console.error('Error updating task:', error);
      throw new InternalServerErrorException(
        `Failed to update task: ${error.message || 'Unknown error'}`,
      );
    }

    return data;
  }

  /**
   * Delete a task
   */
  async remove(id: string, user: UserContext) {
    // First, get the task to validate access
    await this.findOne(id, user);

    // Try to set deleted_by first if the column exists (for database triggers that reference it)
    // This ensures the trigger can access OLD.deleted_by during DELETE
    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('tasks')
      .update({ deleted_by: user.user_id })
      .eq('id', id);

    // If update fails because deleted_by column doesn't exist, skip it and try delete anyway
    // The delete might still work if the trigger handles missing deleted_by gracefully
    if (updateError) {
      if (updateError.message && (updateError.message.includes('deleted_by') || updateError.message.includes('column'))) {
        // Column doesn't exist - log warning but continue with delete attempt
        // The trigger might handle this, or we'll get a clear error
        console.warn('Warning: deleted_by column does not exist in tasks table. Attempting delete anyway...');
      } else {
        // Some other update error - log it but continue with delete attempt
        console.warn('Warning: Could not set deleted_by before delete:', updateError.message);
      }
    }

    // Perform the delete
    const { error } = await this.supabaseService
      .getClient()
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      // Check if error is related to deleted_by field (database trigger issue)
      if (error.message && error.message.includes('deleted_by')) {
        // Return BadRequest (400) instead of InternalServerError (500) since this is a schema/configuration issue
        throw new BadRequestException(
          `Cannot delete task: The database trigger requires a 'deleted_by' column in the tasks table, but this column doesn't exist. This is a database configuration issue that needs to be fixed by adding the column or updating the trigger.`,
        );
      }
      
      console.error('Error deleting task:', error);
      throw new InternalServerErrorException(
        `Failed to delete task: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true };
  }
}

