import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/index';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) { }

  @Get('clinic/:clinicId')
  findAll(
    @Param('clinicId') clinicId: string,
    @GetUser() user: any,
    @Query('assignedTo') assignedTo?: string,
    @Query('status') status?: string,
    @Query('scope') scope?: 'all' | 'mine',
  ) {
    return this.tasksService.findAll(clinicId, user, { assignedTo, status, scope });
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string, @GetUser() user: any) {
    return this.tasksService.findByUser(userId, user);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.tasksService.findByPet(petId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.tasksService.findOne(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createTaskDto: CreateTaskDto, @GetUser() user: any) {
    return this.tasksService.create(createTaskDto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateTaskDto: UpdateTaskDto,
    @GetUser() user: any,
  ) {
    return this.tasksService.update(id, updateTaskDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.tasksService.remove(id, user);
  }
}

