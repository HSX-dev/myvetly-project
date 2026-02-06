import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClinicUserRoleDto } from './dto/create-clinic-user-role.dto';
import { UpdateClinicUserRoleDto } from './dto/update-clinic-user-role.dto';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class RolesService {
  constructor(private supabaseService: SupabaseService) {}

  // Admin Roles (admin_roles table) methods
  async findAllAdminRoles() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

  async findOneAdminRole(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Admin role with id ${id} not found`);
    return data;
  }

  async createAdminRole(roleData: any) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .insert(roleData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateAdminRole(id: string, roleData: any) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_roles')
      .update(roleData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new NotFoundException(`Admin role with id ${id} not found`);
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

    if (error) throw error;
    return data;
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
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
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
      throw new ForbiddenException('Access denied: Cannot view role from other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select(`
        *,
        userCount: users!users_role_id_fkey(count)
      `)
      .eq('id', roleId)
      .single();

    if (error) throw error;
    return data;
  }

  async createClinicUserRole(createDto: CreateClinicUserRoleDto, user: UserContext) {
    // Validate access
    if (user.role !== 'super_admin' && user.clinic_id !== createDto.clinic_id) {
      throw new ForbiddenException('Access denied: Cannot create roles for other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .insert(createDto)
      .select(`
        *,
        userCount: users!users_role_id_fkey(count)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async updateClinicUserRole(roleId: string, updateDto: UpdateClinicUserRoleDto, user: UserContext) {
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
      throw new ForbiddenException('Access denied: Cannot update roles from other clinics');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .update(updateDto)
      .eq('id', roleId)
      .select(`
        *,
        userCount: users!users_role_id_fkey(count)
      `)
      .single();

    if (error) throw error;
    return data;
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

