import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class RemindersService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get upcoming reminders for the user's clinic (or all for super_admin), ordered by due_date.
   */
  async findUpcoming(user: UserContext, limit = 10) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    let query = this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .select(`
        id,
        task_title,
        task_type,
        due_date,
        status,
        description,
        created_at,
        completed_at,
        pet_id,
        pets(id, name)
      `)
      .neq('status', 'completed')
      .gte('due_date', todayISO)
      .order('due_date', { ascending: true })
      .limit(Math.min(limit, 100));

    if (user.role !== 'super_admin' && user.clinic_id) {
      query = query.eq('clinic_id', user.clinic_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching upcoming reminders:', error);
      throw new InternalServerErrorException(
        `Failed to fetch upcoming reminders: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((task: any) => {
      let status: 'Pending' | 'Completed' | 'Overdue' = 'Pending';
      if (task.status === 'completed') {
        status = 'Completed';
      } else if (task.due_date) {
        const dueDate = new Date(task.due_date);
        if (dueDate < today) {
          status = 'Overdue';
        }
      }
      return {
        id: task.id,
        name: task.task_title || '',
        due_date: task.due_date,
        trigger_product: task.task_type === 'medication' ? task.description : undefined,
        status,
        template: task.task_type,
        notifications: [],
        created_at: task.created_at,
        task_title: task.task_title,
        task_type: task.task_type,
        description: task.description,
        pet_id: task.pet_id,
        pet: task.pets,
      };
    });
  }

  /**
   * Get reminders for a specific pet
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

    const { data, error } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .select(`
        id,
        task_title,
        task_type,
        due_date,
        status,
        description,
        created_at,
        completed_at
      `)
      .eq('pet_id', petId)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching reminders:', error);
      throw new InternalServerErrorException(
        `Failed to fetch reminders: ${error.message || 'Unknown error'}`,
      );
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Map to Reminder interface (matching frontend logic)
    return data.map((task: any) => {
      // Determine status
      let status: 'Pending' | 'Completed' | 'Overdue' = 'Pending';
      if (task.status === 'completed') {
        status = 'Completed';
      } else if (task.status === 'due') {
        const dueDate = new Date(task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) {
          status = 'Overdue';
        }
      }

      return {
        id: task.id,
        name: task.task_title || '',
        due_date: task.due_date,
        trigger_product: task.task_type === 'medication' ? task.description : undefined,
        status,
        template: task.task_type,
        notifications: [], // Notifications aren't stored in preventive_care_tasks
        created_at: task.created_at,
        task_title: task.task_title,
        task_type: task.task_type,
        description: task.description,
      };
    });
  }

  /**
   * Create a new reminder
   */
  async create(createReminderDto: CreateReminderDto, user: UserContext) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', createReminderDto.pet_id)
      .single();

    if (petError || !pet) {
      throw new NotFoundException(`Pet with id ${createReminderDto.pet_id} not found`);
    }

    // Validate clinic access
    if (user.role !== 'super_admin' && pet.tenant_id && user.clinic_id !== pet.tenant_id) {
      throw new ForbiddenException('Access denied: You do not have access to this pet');
    }

    // Use user's clinic_id if not provided
    const clinicId = createReminderDto.clinic_id || user.clinic_id;

    const reminderData = {
      pet_id: createReminderDto.pet_id,
      clinic_id: clinicId,
      task_title: createReminderDto.task_title,
      task_type: createReminderDto.task_type || 'other',
      due_date: createReminderDto.due_date,
      description: createReminderDto.description || null,
      assigned_to: createReminderDto.assigned_to || null,
      status: 'upcoming',
    };

    const { data: reminder, error } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .insert([reminderData])
      .select()
      .single();

    if (error) {
      console.error('Error creating reminder:', error);
      throw new InternalServerErrorException(
        `Failed to create reminder: ${error.message || 'Unknown error'}`,
      );
    }

    // Transform to match frontend Reminder interface
    return {
      id: reminder.id,
      pet_id: reminder.pet_id,
      name: reminder.task_title || '',
      due_date: reminder.due_date,
      status: 'Pending',
      template: reminder.task_type,
      notifications: [],
      created_at: reminder.created_at,
      task_title: reminder.task_title,
      task_type: reminder.task_type,
      description: reminder.description,
    };
  }

  /**
   * Delete a reminder by id (validates user has access via pet's clinic).
   */
  async remove(id: string, user: UserContext) {
    const { data: task, error: taskError } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .select('id, clinic_id')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    if (user.role !== 'super_admin' && task.clinic_id && user.clinic_id !== task.clinic_id) {
      throw new ForbiddenException('Access denied: You do not have access to this reminder');
    }

    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting reminder:', deleteError);
      throw new InternalServerErrorException(
        `Failed to delete reminder: ${deleteError.message || 'Unknown error'}`,
      );
    }

    return { success: true };
  }

  /**
   * Update a reminder by id (validates user has access via clinic).
   */
  async update(id: string, dto: UpdateReminderDto, user: UserContext) {
    const { data: task, error: taskError } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .select('id, clinic_id, pet_id')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    if (user.role !== 'super_admin' && task.clinic_id && user.clinic_id !== task.clinic_id) {
      throw new ForbiddenException('Access denied: You do not have access to this reminder');
    }

    const updates: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      updates.task_title = dto.title;
    }
    const categoryOrType = (dto as any).category ?? (dto as any).task_type;
    if (categoryOrType !== undefined) {
      updates.task_type = typeof categoryOrType === 'string' ? categoryOrType : String(categoryOrType);
    }
    if (dto.start_date !== undefined) {
      const firstTime = dto.times_of_day?.[0] ?? '09:00';
      const timePart = firstTime.length <= 5 ? `${firstTime}:00` : firstTime;
      updates.due_date = `${dto.start_date}T${timePart}`;
    } else if (dto.times_of_day !== undefined && dto.times_of_day.length > 0) {
      const { data: existing } = await this.supabaseService
        .getClient()
        .from('preventive_care_tasks')
        .select('due_date')
        .eq('id', id)
        .single();
      const existingDue = (existing as any)?.due_date ?? '';
      const datePart = existingDue.toString().split('T')[0] || new Date().toISOString().split('T')[0];
      const firstTime = dto.times_of_day[0];
      const timePart = firstTime.length <= 5 ? `${firstTime}:00` : firstTime;
      updates.due_date = `${datePart}T${timePart}`;
    }
    if (dto.status !== undefined) {
      updates.status = dto.status === 'paused' ? 'paused' : 'upcoming';
    }
    if ((dto as any).notes !== undefined) {
      updates.description = (dto as any).notes;
    }

    if (Object.keys(updates).length === 0) {
      return this.findByPet(task.pet_id, user).then((list) =>
        list.find((r: any) => r.id === id) ?? null
      );
    }

    const { data: updated, error: updateError } = await this.supabaseService
      .getClient()
      .from('preventive_care_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating reminder:', updateError);
      throw new InternalServerErrorException(
        `Failed to update reminder: ${updateError.message || 'Unknown error'}`,
      );
    }

    return {
      id: updated.id,
      pet_id: updated.pet_id,
      name: updated.task_title || '',
      due_date: updated.due_date,
      status: updated.status === 'completed' ? 'Completed' : 'Pending',
      template: updated.task_type,
      notifications: [],
      created_at: updated.created_at,
      task_title: updated.task_title,
      task_type: updated.task_type,
      description: updated.description,
    };
  }
}

