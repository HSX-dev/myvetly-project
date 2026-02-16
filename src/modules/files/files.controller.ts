import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, HttpStatus, BadRequestException, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileDto } from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) { }

  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  // Specific routes must come before parameterized routes
  @Get('url')
  getFileUrl(@Query('storagePath') storagePath: string) {
    if (!storagePath || storagePath.trim() === '') {
      throw new BadRequestException('storagePath query parameter is required');
    }
    return this.filesService.getFileUrl(storagePath);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string) {
    return this.filesService.findByPet(petId);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.filesService.findByClient(clientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createFileDto: CreateFileDto, @GetUser() user: UserContext) {
    return this.filesService.create(createFileDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.filesService.remove(id);
  }
}

