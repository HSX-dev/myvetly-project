import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('*');

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`User with id ${id} not found`);
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

  async create(createUserDto: CreateUserDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .insert(createUserDto)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('users')
      .update(updateUserDto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;
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
}

