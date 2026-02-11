import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string) {
    return this.filesService.findByPet(petId);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.filesService.findByClient(clientId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createFileDto: CreateFileDto) {
    return this.filesService.create(createFileDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.filesService.remove(id);
  }

  @Get('url/:storagePath')
  getFileUrl(@Param('storagePath') storagePath: string) {
    return this.filesService.getFileUrl(storagePath);
  }
}

