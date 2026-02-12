import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateFileDto } from './dto';

@Injectable()
export class FilesService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('*, pets(*), clients(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .select('*, pets(*), clients(*)')
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

  async create(createFileDto: CreateFileDto) {
    // If client_id is provided but pet_id is not, we need to link the file to a pet
    // Since files table doesn't have client_id column, we'll use the first pet of the client
    let fileData = { ...createFileDto };

    if (createFileDto.client_id && !createFileDto.pet_id) {
      // Get the first pet for this client
      const { data: pets, error: petsError } = await this.supabaseService
        .getClient()
        .from('pets')
        .select('id')
        .eq('client_id', createFileDto.client_id)
        .limit(1)
        .single();

      if (petsError || !pets) {
        throw new NotFoundException(`Failed to find a pet for client ${createFileDto.client_id}. Client files must be linked to a pet.`);
      }

      // Use the pet_id instead of client_id
      fileData = {
        ...createFileDto,
        pet_id: pets.id,
        client_id: undefined, // Remove client_id as it doesn't exist in the table
      };
    } else if (createFileDto.client_id) {
      // If both are provided, remove client_id as it doesn't exist in the table
      fileData = {
        ...createFileDto,
        client_id: undefined,
      };
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('files')
      .insert(fileData)
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

