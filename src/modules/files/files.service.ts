import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateFileDto } from './dto';
import type { UserContext } from '../auth/auth.guard';

@Injectable()
export class FilesService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`File with id ${id} not found`);
    return data;
  }

  async findByPet(petId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Add public URLs for each file
    const filesWithUrls = (data || []).map((file: any) => {
      let fileUrl = '';
      if (file.storage_path) {
        // Extract bucket and path from storage_path
        // Assuming format: bucket-name/path/to/file
        const pathParts = file.storage_path.split('/');
        const bucket = pathParts[0];
        const path = pathParts.slice(1).join('/');

        const { data: urlData } = this.supabaseService
          .getClient()
          .storage
          .from(bucket)
          .getPublicUrl(path);

        fileUrl = urlData?.publicUrl || '';
      }

      // Determine file type from kind or name extension
      let fileType = file.kind || 'application/octet-stream';
      if (!file.kind && file.name) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
          fileType = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
        } else if (ext === 'pdf') {
          fileType = 'application/pdf';
        }
      }

      return {
        ...file,
        url: fileUrl,
        type: fileType,
        size: file.file_size || 0,
        uploaded_at: file.created_at,
      };
    });

    return filesWithUrls;
  }

  async findByClient(clientId: string) {
    // Files are linked to pets via pet_id, and pets are linked to clients via client_id
    // First, get all pet IDs for this client
    const { data: pets, error: petsError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('id')
      .eq('client_id', clientId);

    if (petsError) throw petsError;

    // If no pets found, return empty array
    if (!pets || pets.length === 0) {
      return [];
    }

    const petIds = pets.map(pet => pet.id);

    // Then get all files for those pets
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('id, name, file_size, storage_path, created_at')
      .in('pet_id', petIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Add public URLs for each file
    const filesWithUrls = (data || []).map((file: any) => {
      let fileUrl = '';
      if (file.storage_path) {
        // Extract bucket and path from storage_path
        const pathParts = file.storage_path.split('/');
        const bucket = pathParts[0];
        const path = pathParts.slice(1).join('/');

        const { data: urlData } = this.supabaseService
          .getClient()
          .storage
          .from(bucket)
          .getPublicUrl(path);

        fileUrl = urlData?.publicUrl || '';
      }

      // Determine file type from name extension
      let fileType = 'application/octet-stream';
      if (file.name) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
          fileType = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
        } else if (ext === 'pdf') {
          fileType = 'application/pdf';
        }
      }

      return {
        ...file,
        url: fileUrl,
        type: fileType,
        size: file.file_size || 0,
        uploaded_at: file.created_at,
      };
    });

    return filesWithUrls;
  }

  /**
   * Get public URL for a file from storage
   */
  async getFileUrl(storagePath: string): Promise<{ url: string }> {
    // Extract bucket and path from storage_path
    // Assuming format: bucket-name/path/to/file
    const pathParts = storagePath.split('/');
    if (pathParts.length < 2) {
      throw new BadRequestException('Invalid storage path format');
    }

    const bucket = pathParts[0];
    const path = pathParts.slice(1).join('/');

    const { data } = this.supabaseService
      .getClient()
      .storage
      .from(bucket)
      .getPublicUrl(path);

    return { url: data.publicUrl };
  }

  async create(createFileDto: CreateFileDto, user: UserContext) {
    // Validate that at least one of pet_id or client_id is provided
    if (!createFileDto.pet_id && !createFileDto.client_id) {
      throw new BadRequestException('Either pet_id or client_id must be provided');
    }

    // If client_id is provided but pet_id is not, we need to link the file to a pet
    // Since files table doesn't have client_id column, we'll use the first pet of the client
    let fileData = { ...createFileDto };
    let tenantId: string;

    if (createFileDto.client_id && !createFileDto.pet_id) {
      // Get the first pet for this client
      const { data: pets, error: petsError } = await this.supabaseService
        .getClient()
        .from('pets')
        .select('id, tenant_id')
        .eq('client_id', createFileDto.client_id)
        .limit(1)
        .single();

      if (petsError || !pets) {
        throw new NotFoundException(`Failed to find a pet for client ${createFileDto.client_id}. Client files must be linked to a pet.`);
      }

      // Validate clinic access
      if (pets.tenant_id && user.clinic_id !== pets.tenant_id && user.role !== 'super_admin') {
        throw new ForbiddenException('Access denied: You do not have access to this pet');
      }

      // Use the pet_id instead of client_id
      fileData = {
        ...createFileDto,
        pet_id: pets.id,
        client_id: undefined, // Remove client_id as it doesn't exist in the table
      };
      tenantId = pets.tenant_id || user.clinic_id;
      if (!tenantId) {
        throw new BadRequestException('Unable to determine tenant_id. Please ensure the pet has a tenant_id or you are associated with a clinic.');
      }
    } else if (createFileDto.pet_id) {
      // Get pet to validate access and get tenant_id
      const { data: pet, error: petError } = await this.supabaseService
        .getClient()
        .from('pets')
        .select('tenant_id')
        .eq('id', createFileDto.pet_id)
        .single();

      if (petError || !pet) {
        throw new NotFoundException(`Pet with id ${createFileDto.pet_id} not found`);
      }

      // Validate clinic access
      if (pet.tenant_id && user.clinic_id !== pet.tenant_id && user.role !== 'super_admin') {
        throw new ForbiddenException('Access denied: You do not have access to this pet');
      }

      tenantId = pet.tenant_id || user.clinic_id;
      if (!tenantId) {
        throw new BadRequestException('Unable to determine tenant_id. Please ensure the pet has a tenant_id or you are associated with a clinic.');
      }
      
      // Remove client_id as it doesn't exist in the table
      if (createFileDto.client_id) {
        fileData = {
          ...createFileDto,
          client_id: undefined,
        };
      }
    } else {
      // Fallback to user's clinic_id if no pet_id is available
      if (!user.clinic_id) {
        throw new BadRequestException('Unable to determine tenant_id. Please provide a pet_id or ensure you are associated with a clinic.');
      }
      tenantId = user.clinic_id;
    }

    // Derive kind (MIME type) from file extension if not provided
    let kind = createFileDto.kind;
    if (!kind) {
      const fileName = fileData.name || fileData.storage_path;
      const ext = fileName?.split('.').pop()?.toLowerCase();
      
      // Map common extensions to MIME types
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'txt': 'text/plain',
        'csv': 'text/csv',
      };
      
      kind = ext && mimeTypes[ext] ? mimeTypes[ext] : 'application/octet-stream';
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .insert({
        ...fileData,
        tenant_id: tenantId,
        kind: kind,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create file record: ${error.message}`);
    }

    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('files')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete file record: ${error.message}`);
    }

    return { success: true };
  }
}

