import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClientDto, UpdateClientDto, CreateClientNoteDto, UpdateClientNoteDto } from './dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class ClientsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(user: UserContext) {
    const organizationId = user.organization_id;
    const role = user.role;

    let query = this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email ),
        pets!pets_client_id_fkey ( id, name, client_id )
      `);

    // Exclude deleted clients
    query = query.or('status.is.null,status.neq.deleted');

    // Only super_admin can see all clients across organizations
    // All other roles (including clinic_admin) should be filtered by organization
    if (role !== 'super_admin') {
      if (!organizationId) {
        return [];
      }
      // Include clients with matching organization_id OR null organization_id
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) {
      return [];
    }

    // Map the data to match frontend Client type
    // Pets are now included via JOIN, so we can process them directly
    const clients = data
      .map(item => {
        const user = Array.isArray(item.users) ? item.users[0] : item.users;
        
        // Handle pets from JOIN - may be array, single object, or null
        let pets: Array<{ id: string; name: string }> = [];
        if (item.pets) {
          const petsArray = Array.isArray(item.pets) ? item.pets : [item.pets];
          pets = petsArray
            .filter((pet: any) => pet && pet.id)
            .map((pet: any) => ({
              id: pet.id,
              name: pet.name || 'Unnamed Pet',
            }));
        }

        // Return all client fields from the database, plus user info and pets
        return {
          ...item, // Include all fields from clients table
          first_name: user?.first_name ?? '',
          last_name: user?.last_name ?? '',
          full_name: user?.full_name ?? '',
          email: user?.email ?? '',
          clinic_name: item.clinic_name || 'N/A',
          pet_names: pets, // Store pets array for table display
        };
      })
      .filter(client => client.id); // Ensure we only return clients with valid IDs

    return clients;
  }

  /**
   * Get all clients including deleted ones
   */
  async findAllIncludingDeleted(user: UserContext) {
    const organizationId = user.organization_id;
    const role = user.role;

    let query = this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email ),
        pets!pets_client_id_fkey ( id, name, client_id )
      `);

    // Include deleted clients - don't filter them out

    // Only super_admin can see all clients across organizations
    // All other roles (including clinic_admin) should be filtered by organization
    if (role !== 'super_admin') {
      if (!organizationId) {
        return [];
      }
      // Include clients with matching organization_id OR null organization_id
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) {
      return [];
    }

    // Map the data to match frontend Client type
    // Pets are now included via JOIN, so we can process them directly
    const clients = data
      .map(item => {
        const user = Array.isArray(item.users) ? item.users[0] : item.users;
        
        // Handle pets from JOIN - may be array, single object, or null
        let pets: Array<{ id: string; name: string }> = [];
        if (item.pets) {
          const petsArray = Array.isArray(item.pets) ? item.pets : [item.pets];
          pets = petsArray
            .filter((pet: any) => pet && pet.id)
            .map((pet: any) => ({
              id: pet.id,
              name: pet.name || 'Unnamed Pet',
            }));
        }

        // Return all client fields from the database, plus user info and pets
        return {
          ...item, // Include all fields from clients table (including status, deleted_at, deleted_by)
          first_name: user?.first_name ?? '',
          last_name: user?.last_name ?? '',
          full_name: user?.full_name ?? '',
          email: user?.email ?? '',
          clinic_name: item.clinic_name || 'N/A',
          pet_names: pets, // Store pets array for table display
        };
      })
      .filter(client => client.id); // Ensure we only return clients with valid IDs

    return clients;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Client with id ${id} not found`);
      }
      throw error;
    }

    if (!data) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    const { users, ...clientData } = data;
    const user = Array.isArray(users) ? users[0] : users;

    // Map database field names to frontend Client type field names
    return {
      ...clientData,
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      clinic_name: 'N/A',
      // Map database alert field to alert_notes
      alert_notes: clientData.alert,
      // Map database communication fields to Client type fields
      comm_email_ok: clientData.comm_appointment_notification ?? true,
      comm_phone_ok: clientData.comm_mass_communication ?? true,
      comm_sms_ok: clientData.comm_client_reminders ?? true,
      comm_mail_ok: false, // Not in database, default to false
    };
  }

  async findByUserId(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email )
      `)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Client with user_id ${userId} not found`);
      }
      throw error;
    }

    if (!data) {
      throw new NotFoundException(`Client with user_id ${userId} not found`);
    }

    const { users, ...clientData } = data;
    const user = Array.isArray(users) ? users[0] : users;

    // Map database field names to frontend Client type field names
    return {
      ...clientData,
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      clinic_name: 'N/A',
      // Map database alert field to alert_notes
      alert_notes: clientData.alert,
      // Map database communication fields to Client type fields
      comm_email_ok: clientData.comm_appointment_notification ?? true,
      comm_phone_ok: clientData.comm_mass_communication ?? true,
      comm_sms_ok: clientData.comm_client_reminders ?? true,
      comm_mail_ok: false, // Not in database, default to false
    };
  }

  async create(createClientDto: CreateClientDto, user: UserContext) {
    // Separate fields that go to different tables
    const { first_name, last_name, email, ...clientFields } = createClientDto;

    // Step 1: Create user first if we have first_name/last_name or email
    let userId: string | undefined = clientFields.user_id;

    // If a user_id was provided, verify it exists
    if (userId) {
      const { data: existingUser } = await this.supabaseService
        .getClient()
        .from('users')
        .select('id, clinic_id, organization_id')
        .eq('id', userId)
        .maybeSingle();

      if (!existingUser) {
        userId = undefined; // Clear it so we create a new one
      } else {
        // Verify the user belongs to the correct clinic
        if (
          existingUser.clinic_id !== clientFields.clinic_id ||
          existingUser.organization_id !== clientFields.organization_id
        ) {
          userId = undefined; // Clear it so we create a new one
        }
      }
    }

    if ((first_name || last_name || email) && !userId) {
      // Combine first_name and last_name for the users table
      const full_name = [first_name, last_name].filter(Boolean).join(' ');

      // Generate a UUID for the new user
      const newUserId = randomUUID();

      // CRITICAL: organization_id and clinic_id are required for multi-tenant isolation
      if (!clientFields.organization_id || !clientFields.clinic_id) {
        throw new BadRequestException('Organization ID and Clinic ID are required to create a client');
      }

      // Check if user with this email already exists in the SAME clinic/organization
      if (email) {
        const { data: existingUser } = await this.supabaseService
          .getClient()
          .from('users')
          .select('id, clinic_id, organization_id, email')
          .eq('email', email.trim())
          .eq('clinic_id', clientFields.clinic_id)
          .eq('organization_id', clientFields.organization_id)
          .maybeSingle();

        if (existingUser) {
          throw new ConflictException(
            `A client with email ${email} is already registered in this clinic.`,
          );
        }
      }

      // Create a new user for this client
      const userData: any = {
        id: newUserId,
        full_name: full_name || '',
        first_name: first_name || '',
        last_name: last_name || '',
        email: email || '',
        organization_id: clientFields.organization_id,
        clinic_id: clientFields.clinic_id,
      };

      const { data: newUser, error: userError } = await this.supabaseService
        .getClient()
        .from('users')
        .insert(userData)
        .select('id')
        .single();

      if (userError) {
        // If it's a duplicate/conflict error, throw a clear error message
        if (
          userError.code === '23505' ||
          userError.message.includes('duplicate') ||
          userError.message.includes('unique')
        ) {
          if (email) {
            throw new ConflictException(`A client with email ${email} is already registered.`);
          } else {
            throw new BadRequestException(`Failed to create user: ${userError.message}`);
          }
        } else {
          throw new BadRequestException(`Failed to create user: ${userError.message}`);
        }
      } else {
        userId = newUser?.id || newUserId;
      }
    }

    if (!userId) {
      throw new BadRequestException('User ID is required to create a client');
    }

    // Verify the user exists before creating the client
    const { data: verifyUser, error: verifyError } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, email, full_name, clinic_id, organization_id')
      .eq('id', userId)
      .maybeSingle();

    if (verifyError || !verifyUser) {
      throw new NotFoundException(`User with ID ${userId} does not exist. Cannot create client.`);
    }

    // Double-check the user belongs to the correct clinic
    if (verifyUser.clinic_id !== clientFields.clinic_id) {
      throw new BadRequestException(
        `User belongs to a different clinic. Expected ${clientFields.clinic_id}, got ${verifyUser.clinic_id}`,
      );
    }

    // Step 2: Map form field names to database field names
    const fieldsToInsert: any = {
      phone: clientFields.phone,
      title: clientFields.title,
      aka: clientFields.aka,
      gender: clientFields.gender,
      client_type: clientFields.client_type,
      comm_preferred_contact_method: clientFields.comm_preferred_contact_method,
      address_street: clientFields.address_street,
      address_apt: clientFields.address_apt,
      address_city: clientFields.address_city,
      address_state: clientFields.address_state,
      address_zip: clientFields.address_zip,
      drivers_license_number: clientFields.drivers_license_number,
      drivers_license_expiration: clientFields.drivers_license_expiration,
      // Map alert_notes to alert (database field name)
      alert: clientFields.alert_notes,
      account_source: clientFields.account_source,
      tax_exempt: clientFields.tax_exempt,
      additional_info: clientFields.additional_info,
      // Map communication preference fields to database field names
      comm_appointment_notification: clientFields.comm_email_ok ?? true,
      comm_mass_communication: clientFields.comm_phone_ok ?? true,
      comm_client_reminders: clientFields.comm_sms_ok ?? true,
      // System fields
      organization_id: clientFields.organization_id,
      clinic_id: clientFields.clinic_id,
      user_id: userId,
    };

    // Remove undefined/null values
    Object.keys(fieldsToInsert).forEach((key) => {
      if (fieldsToInsert[key] === undefined || fieldsToInsert[key] === null) {
        delete fieldsToInsert[key];
      }
    });

    // Step 3: Create the client
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .insert(fieldsToInsert)
      .select(`
        *,
        users!clients_user_id_fkey ( first_name, last_name, full_name, email )
      `)
      .single();

    if (error) {
      throw new BadRequestException(`Client creation failed: ${error.message}`);
    }

    if (!data) {
      throw new InternalServerErrorException('No data returned from create');
    }

    const { users, ...newClient } = data;
    const userData = Array.isArray(users) ? users[0] : users;

    return {
      ...newClient,
      first_name: userData?.first_name ?? '',
      last_name: userData?.last_name ?? '',
      full_name: userData?.full_name ?? '',
      email: userData?.email ?? '',
      clinic_name: 'N/A',
    };
  }

  async update(id: string, updateClientDto: UpdateClientDto, user: UserContext) {
    // Separate fields that go to different tables
    const { first_name, last_name, full_name, email, ...clientFields } = updateClientDto;

    try {
      // First, get the current client to get the user_id
      const { data: currentClient, error: fetchError } = await this.supabaseService
        .getClient()
        .from('clients')
        .select('user_id, id, clinic_id, organization_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw new InternalServerErrorException(`Failed to fetch client: ${fetchError.message}`);
      }

      // Prepare client fields for update - map form field names to database field names
      const fieldsToUpdate: any = {
        phone: clientFields.phone,
        title: clientFields.title,
        aka: clientFields.aka,
        gender: clientFields.gender,
        client_type: clientFields.client_type,
        comm_preferred_contact_method: clientFields.comm_preferred_contact_method,
        address_street: clientFields.address_street,
        address_apt: clientFields.address_apt,
        address_city: clientFields.address_city,
        address_state: clientFields.address_state,
        address_zip: clientFields.address_zip,
        drivers_license_number: clientFields.drivers_license_number,
        drivers_license_expiration: clientFields.drivers_license_expiration,
        // Map alert_notes to alert (database field name)
        alert: clientFields.alert_notes,
        account_source: clientFields.account_source,
        tax_exempt: clientFields.tax_exempt,
        additional_info: clientFields.additional_info,
        // Communication preference fields
        comm_appointment_notification: clientFields.comm_email_ok,
        comm_mass_communication: clientFields.comm_phone_ok,
        comm_client_reminders: clientFields.comm_sms_ok,
      };

      // Remove undefined/null values to avoid overwriting with null
      // But preserve boolean false values
      Object.keys(fieldsToUpdate).forEach((key) => {
        if (fieldsToUpdate[key] === undefined || fieldsToUpdate[key] === null) {
          delete fieldsToUpdate[key];
        }
      });

      // Update the clients table
      const { data: updatedClientData, error: clientError } = await this.supabaseService
        .getClient()
        .from('clients')
        .update(fieldsToUpdate)
        .eq('id', id)
        .select('*')
        .single();

      if (clientError) {
        throw new BadRequestException(`Failed to update client: ${clientError.message}`);
      }

      // Update the users table if we have user fields
      if (first_name || last_name || full_name || email) {
        const userUpdates: any = {};
        if (first_name !== undefined) userUpdates.first_name = first_name;
        if (last_name !== undefined) userUpdates.last_name = last_name;
        // Combine first_name and last_name into full_name if they exist
        if (first_name || last_name) {
          userUpdates.full_name = [first_name, last_name].filter(Boolean).join(' ');
        } else if (full_name) {
          userUpdates.full_name = full_name;
        }
        if (email) userUpdates.email = email;

        const { error: userError } = await this.supabaseService
          .getClient()
          .from('users')
          .update(userUpdates)
          .eq('id', currentClient.user_id);

        if (userError) {
          throw new BadRequestException(`Failed to update user info: ${userError.message}`);
        }
      }

      // Fetch the complete updated client with relations
      const { data, error } = await this.supabaseService
        .getClient()
        .from('clients')
        .select(`
          *,
          users!clients_user_id_fkey ( first_name, last_name, full_name, email )
        `)
        .eq('id', id)
        .single();

      if (error) {
        throw new InternalServerErrorException(`Failed to fetch updated client: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from update');
      }

      const { users, ...updatedClient } = data;
      const userData = Array.isArray(users) ? users[0] : users;

      return {
        ...updatedClient,
        first_name: userData?.first_name ?? '',
        last_name: userData?.last_name ?? '',
        full_name: userData?.full_name ?? '',
        email: userData?.email ?? '',
        clinic_name: 'N/A',
        // Map database alert field to alert_notes
        alert_notes: updatedClient.alert,
        // Map database communication fields to Client type fields
        comm_email_ok: updatedClient.comm_appointment_notification ?? true,
        comm_phone_ok: updatedClient.comm_mass_communication ?? true,
        comm_sms_ok: updatedClient.comm_client_reminders ?? true,
        comm_mail_ok: false,
      };
    } catch (error) {
      throw error;
    }
  }

  async remove(id: string, user: UserContext) {
    // First check if the client exists
    const { data: existingClient, error: checkError } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      throw new InternalServerErrorException(`Failed to check client: ${checkError.message}`);
    }

    if (!existingClient) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    // Perform soft delete instead of hard delete
    // Use user.user_id (users table ID) instead of user.id (auth_user_id)
    const { error } = await this.supabaseService
      .getClient()
      .from('clients')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        ...(user.user_id && { deleted_by: user.user_id }),
      })
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete client: ${error.message}`);
    }
    return { success: true };
  }

  /**
   * Restore a soft-deleted client (change status from 'deleted' to 'active')
   */
  async restore(id: string, user: UserContext) {
    // Get the client to validate access
    const client = await this.findOne(id);

    // RLS Validation: Check if user can restore this client
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can only restore clients in their organization
        if (client.organization_id !== user.organization_id) {
          throw new ForbiddenException('Access denied: Cannot restore clients outside your organization');
        }
      } else {
        // Clinic admin and below can only restore clients in their clinic
        if (client.organization_id !== user.organization_id || 
            client.clinic_id !== user.clinic_id) {
          throw new ForbiddenException('Access denied: Cannot restore clients outside your clinic');
        }
      }
    }

    // Restore by setting status to 'active' and clearing deleted fields
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clients')
      .update({ 
        status: 'active',
        deleted_at: null,
        deleted_by: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error restoring client:', error);
      throw new InternalServerErrorException(
        `Failed to restore client: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true, data };
  }

  /**
   * Permanently delete a client (hard delete)
   * WARNING: This permanently removes the client from the database
   */
  async hardDelete(id: string, user: UserContext) {
    // Get the client to validate access
    const client = await this.findOne(id);

    // RLS Validation: Check if user can permanently delete this client
    if (user.role !== 'super_admin') {
      if (user.role === 'org_admin') {
        // Org admin can only delete clients in their organization
        if (client.organization_id !== user.organization_id) {
          throw new ForbiddenException('Access denied: Cannot permanently delete clients outside your organization');
        }
      } else {
        // Clinic admin and below can only delete clients in their clinic
        if (client.organization_id !== user.organization_id || 
            client.clinic_id !== user.clinic_id) {
          throw new ForbiddenException('Access denied: Cannot permanently delete clients outside your clinic');
        }
      }
    }

    // Hard delete - permanently remove from database
    const { error } = await this.supabaseService
      .getClient()
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting client:', error);
      
      // Check for foreign key constraint violations
      if (error.code === '23503') {
        // Extract which table is causing the constraint violation
        let relatedEntity = 'related records';
        if (error.message?.includes('appointments')) {
          relatedEntity = 'appointments';
        } else if (error.message?.includes('pets')) {
          relatedEntity = 'pets';
        } else if (error.message?.includes('invoices')) {
          relatedEntity = 'invoices';
        } else if (error.message?.includes('client_notes')) {
          relatedEntity = 'client notes';
        }
        
        throw new ConflictException(
          `Cannot permanently delete client: This client has ${relatedEntity} associated with it. Please delete or reassign the ${relatedEntity} first, or use soft delete instead.`
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to permanently delete client: ${error.message || 'Unknown error'}`,
      );
    }

    return { success: true };
  }

  async getPetsByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('*')
      .eq('client_id', clientId);

    if (error) throw error;
    return data;
  }

  async getAppointmentsByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`
        id,
        appointment_time,
        service_type,
        status,
        pet_id,
        client_id,
        vet_id,
        tenant_id,
        symptoms,
        notes,
        created_at,
        updated_at,
        pets (
          id,
          name,
          species,
          breed
        ),
        clients!client_id (
          id,
          phone,
          user_id,
          users!user_id (
            id,
            full_name,
            email
          )
        ),
        users!vet_id (
          id,
          full_name
        )
      `)
      .eq('client_id', clientId)
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Client Notes Methods
  async getClientNotes(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('client_notes')
      .select(`
        *,
        created_by_user:users!created_by(id, full_name)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createClientNote(createNoteDto: CreateClientNoteDto, user: UserContext) {
    // Validate required fields are present
    if (!createNoteDto.client_id) {
      throw new Error('client_id is required');
    }
    if (!createNoteDto.clinic_id) {
      throw new Error('clinic_id is required');
    }
    if (!user.organization_id) {
      throw new Error('organization_id is required (from user context)');
    }
    if (!createNoteDto.content) {
      throw new Error('content is required');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('client_notes')
      .insert({
        client_id: createNoteDto.client_id,
        title: createNoteDto.title,
        content: createNoteDto.content,
        clinic_id: createNoteDto.clinic_id,
        organization_id: user.organization_id, // Required by database - get from user context
        created_by: user.user_id, // Use user_id from UserContext, not user.id
      })
      .select(`
        *,
        created_by_user:users!created_by(id, full_name)
      `)
      .single();

    if (error) {
      throw new Error(`Failed to create client note: ${error.message}`);
    }

    return data;
  }

  async updateClientNote(noteId: string, updateNoteDto: UpdateClientNoteDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('client_notes')
      .update(updateNoteDto)
      .eq('id', noteId)
      .select(`
        *,
        created_by_user:users!created_by(id, full_name)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Client note with id ${noteId} not found`);
      }
      throw new InternalServerErrorException(`Failed to update client note: ${error.message}`);
    }

    return data;
  }

  async deleteClientNote(noteId: string) {
    // First check if the note exists
    const { data: existingNote, error: checkError } = await this.supabaseService
      .getClient()
      .from('client_notes')
      .select('id')
      .eq('id', noteId)
      .maybeSingle();

    if (checkError) {
      throw new InternalServerErrorException(`Failed to check client note: ${checkError.message}`);
    }

    if (!existingNote) {
      throw new NotFoundException(`Client note with id ${noteId} not found`);
    }

    // Now delete the note
    const { error } = await this.supabaseService
      .getClient()
      .from('client_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete client note: ${error.message}`);
    }

    return { success: true };
  }
}

