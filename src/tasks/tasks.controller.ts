import { Controller, Get, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll() {
    return this.tasksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.tasksService.findByUser(userId);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.tasksService.findByPet(petId, user);
  }
}

