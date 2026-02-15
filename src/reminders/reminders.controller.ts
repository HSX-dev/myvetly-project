import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.remindersService.findByPet(petId, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createReminderDto: CreateReminderDto, @GetUser() user: any) {
    // Handle field name mapping if task_title is missing but message is present
    if (!createReminderDto.task_title && (createReminderDto as any).message) {
      createReminderDto.task_title = (createReminderDto as any).message;
    }
    
    // Handle field name mapping if due_date is missing but reminder_date is present
    if (!createReminderDto.due_date && (createReminderDto as any).reminder_date) {
      createReminderDto.due_date = (createReminderDto as any).reminder_date;
    }
    
    // Handle field name mapping if task_type is missing but reminder_type is present
    if (!createReminderDto.task_type && (createReminderDto as any).reminder_type) {
      createReminderDto.task_type = (createReminderDto as any).reminder_type as any;
    }
    
    return this.remindersService.create(createReminderDto, user);
  }
}

