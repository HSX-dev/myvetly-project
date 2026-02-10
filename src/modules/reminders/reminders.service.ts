import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import {
  CreateReminderDto,
  UpdateReminderDto,
  MarkCompleteDto,
  CopyReminderDto,
} from './dto';

export interface UpcomingOccurrence {
  reminder_id: string;
  pet_id: string;
  pet_name: string;
  category: string;
  title: string;
  occurrence_date: string;
  occurrence_time: string;
  occurrence_datetime: string;
  status: string;
  notes: string | null;
  photo_url: string | null;
}

@Injectable()
export class RemindersService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Resolve client_id from user_id (x-user-id header).
   * PawMD sends Supabase Auth UID (session.user.id). public.clients.user_id is public.users.id,
   * and public.users.auth_user_id links to auth. So we resolve: auth uid -> users.id -> client.
   */
  async getClientIdFromUserId(userId: string): Promise<string> {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('x-user-id header is required');
    }

    const supabase = this.supabaseService.getClient();

    // Try by auth_user_id first (PawMD sends session.user.id = auth uid)
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (!userError && userRow?.id) {
      const { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userRow.id)
        .maybeSingle();

      if (!clientError && clientRow?.id) {
        return clientRow.id;
      }
    }

    // Fallback: treat userId as internal users.id (clients.user_id)
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !clientData?.id) {
      throw new NotFoundException('Client not found for this user. Please complete your profile.');
    }
    return clientData.id;
  }

  /**
   * Verify that a pet belongs to the given client
   */
  async verifyPetOwnership(petId: string, clientId: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('id')
      .eq('id', petId)
      .eq('client_id', clientId)
      .single();

    if (error || !data) {
      return false;
    }
    return true;
  }

  /**
   * Verify that a reminder belongs to the given client
   */
  async verifyReminderOwnership(
    reminderId: string,
    clientId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('id')
      .eq('id', reminderId)
      .eq('client_id', clientId)
      .single();

    if (error || !data) {
      return false;
    }
    return true;
  }

  /**
   * Create a new reminder
   */
  async create(createReminderDto: CreateReminderDto, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify pet belongs to client
    const ownsP = await this.verifyPetOwnership(
      createReminderDto.pet_id,
      clientId,
    );
    if (!ownsP) {
      throw new ForbiddenException('Pet does not belong to this user');
    }

    // Convert times_of_day strings to time format for PostgreSQL
    const timesForDb = createReminderDto.times_of_day.map((t) => `${t}:00`);

    const insertData = {
      pet_id: createReminderDto.pet_id,
      client_id: clientId,
      category: createReminderDto.category,
      title: createReminderDto.title,
      repeat: createReminderDto.repeat ?? false,
      days_of_week: createReminderDto.days_of_week ?? null,
      times_of_day: timesForDb,
      start_date: createReminderDto.start_date,
      end_date: createReminderDto.end_date ?? null,
      notes: createReminderDto.notes ?? null,
      photo_url: createReminderDto.photo_url ?? null,
      status: createReminderDto.status ?? 'active',
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .insert(insertData)
      .select('*, pets(id, name)')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Find all reminders (admin/debug only - no client scoping)
   */
  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('*, pets(id, name), clients(id)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Find one reminder by ID
   */
  async findOne(id: string, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('*, pets(id, name), reminder_completions(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Reminder with id ${id} not found`);

    // Verify ownership
    if (data.client_id !== clientId) {
      throw new ForbiddenException('Not authorized to access this reminder');
    }

    return data;
  }

  /**
   * Find reminders by pet
   */
  async findByPet(petId: string, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify pet belongs to client
    const ownsPet = await this.verifyPetOwnership(petId, clientId);
    if (!ownsPet) {
      throw new ForbiddenException('Pet does not belong to this user');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('*, pets(id, name), reminder_completions(*)')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Get upcoming reminders across all pets for a user
   */
  async findUpcoming(
    userId: string,
    limit: number = 20,
    filter?: 'today' | 'upcoming' | 'completed',
  ): Promise<UpcomingOccurrence[]> {
    const clientId = await this.getClientIdFromUserId(userId);

    // Get all active reminders for this client with their completions
    const { data: reminders, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('*, pets(id, name), reminder_completions(*)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('start_date', { ascending: true });

    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Compute upcoming occurrences
    const occurrences: UpcomingOccurrence[] = [];

    for (const reminder of reminders || []) {
      const completedDates = new Set(
        (reminder.reminder_completions || []).map(
          (c: any) => c.occurrence_date,
        ),
      );

      const startDate = new Date(reminder.start_date);
      const endDate = reminder.end_date ? new Date(reminder.end_date) : null;

      // Generate occurrences for the next 30 days (or until end_date)
      const maxDays = 30;
      const currentDate = new Date(Math.max(startDate.getTime(), today.getTime()));

      for (let i = 0; i < maxDays; i++) {
        const checkDate = new Date(currentDate);
        checkDate.setDate(currentDate.getDate() + i);

        // Stop if past end_date
        if (endDate && checkDate > endDate) break;

        // Stop if before start_date
        if (checkDate < startDate) continue;

        const dateStr = checkDate.toISOString().split('T')[0];
        const dayOfWeek = checkDate.getDay(); // 0=Sun, 1=Mon, ...

        // Check if this day should have a reminder
        let shouldRemind = false;

        if (reminder.repeat) {
          // For repeating reminders, check if day is in days_of_week
          if (
            reminder.days_of_week &&
            reminder.days_of_week.includes(dayOfWeek)
          ) {
            shouldRemind = true;
          }
        } else {
          // For non-repeating, only on start_date
          if (dateStr === reminder.start_date) {
            shouldRemind = true;
          }
        }

        if (!shouldRemind) continue;

        // Add occurrence for each time
        for (const time of reminder.times_of_day || []) {
          const timeStr = time.substring(0, 5); // "HH:mm"
          const occurrenceDatetime = `${dateStr}T${time}`;

          // Filter based on request
          const isCompleted = completedDates.has(dateStr);
          const isToday = dateStr === todayStr;
          const isFuture = checkDate > today;

          if (filter === 'today' && !isToday) continue;
          if (filter === 'upcoming' && !isFuture && !isToday) continue;
          if (filter === 'completed' && !isCompleted) continue;
          if (!filter && isCompleted) continue; // Default: exclude completed

          occurrences.push({
            reminder_id: reminder.id,
            pet_id: reminder.pet_id,
            pet_name: reminder.pets?.name || 'Unknown',
            category: reminder.category,
            title: reminder.title,
            occurrence_date: dateStr,
            occurrence_time: timeStr,
            occurrence_datetime: occurrenceDatetime,
            status: isCompleted ? 'completed' : 'pending',
            notes: reminder.notes,
            photo_url: reminder.photo_url,
          });
        }
      }
    }

    // Sort by datetime
    occurrences.sort((a, b) =>
      a.occurrence_datetime.localeCompare(b.occurrence_datetime),
    );

    // Return limited results
    return occurrences.slice(0, limit);
  }

  /**
   * Update a reminder
   */
  async update(id: string, updateReminderDto: UpdateReminderDto, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify ownership
    const owns = await this.verifyReminderOwnership(id, clientId);
    if (!owns) {
      throw new ForbiddenException('Not authorized to update this reminder');
    }

    // If changing pet, verify new pet ownership
    if (updateReminderDto.pet_id) {
      const ownsPet = await this.verifyPetOwnership(
        updateReminderDto.pet_id,
        clientId,
      );
      if (!ownsPet) {
        throw new ForbiddenException('Target pet does not belong to this user');
      }
    }

    const updateData: any = { ...updateReminderDto };

    // Convert times if provided
    if (updateReminderDto.times_of_day) {
      updateData.times_of_day = updateReminderDto.times_of_day.map(
        (t) => `${t}:00`,
      );
    }

    // Remove client_id from update (shouldn't change)
    delete updateData.client_id;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .update(updateData)
      .eq('id', id)
      .select('*, pets(id, name)')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a reminder
   */
  async remove(id: string, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify ownership
    const owns = await this.verifyReminderOwnership(id, clientId);
    if (!owns) {
      throw new ForbiddenException('Not authorized to delete this reminder');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, id };
  }

  /**
   * Mark a reminder occurrence as complete (or snoozed)
   */
  async markComplete(
    id: string,
    markCompleteDto: MarkCompleteDto,
    userId: string,
  ) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify ownership
    const owns = await this.verifyReminderOwnership(id, clientId);
    if (!owns) {
      throw new ForbiddenException('Not authorized to complete this reminder');
    }

    // Upsert completion record
    const { data, error } = await this.supabaseService
      .getClient()
      .from('reminder_completions')
      .upsert(
        {
          reminder_id: id,
          occurrence_date: markCompleteDto.occurrence_date,
          completed_at: new Date().toISOString(),
          snoozed_until: markCompleteDto.snoozed_until ?? null,
        },
        {
          onConflict: 'reminder_id,occurrence_date',
        },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Copy a reminder to another pet
   */
  async copy(id: string, copyReminderDto: CopyReminderDto, userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    // Verify ownership of source reminder
    const owns = await this.verifyReminderOwnership(id, clientId);
    if (!owns) {
      throw new ForbiddenException('Not authorized to copy this reminder');
    }

    // Verify ownership of target pet
    const ownsPet = await this.verifyPetOwnership(
      copyReminderDto.target_pet_id,
      clientId,
    );
    if (!ownsPet) {
      throw new ForbiddenException('Target pet does not belong to this user');
    }

    // Get the source reminder
    const { data: source, error: fetchError } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !source) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    // Create copy with new pet_id
    const copyData = {
      pet_id: copyReminderDto.target_pet_id,
      client_id: clientId,
      category: source.category,
      title: source.title,
      repeat: source.repeat,
      days_of_week: source.days_of_week,
      times_of_day: source.times_of_day,
      start_date: source.start_date,
      end_date: source.end_date,
      notes: source.notes,
      photo_url: source.photo_url,
      status: source.status,
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pet_reminders')
      .insert(copyData)
      .select('*, pets(id, name)')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get all pets for a user (for copy picker)
   */
  async getUserPets(userId: string) {
    const clientId = await this.getClientIdFromUserId(userId);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('id, name, species, breed, profile_image_url')
      .eq('client_id', clientId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }
}
