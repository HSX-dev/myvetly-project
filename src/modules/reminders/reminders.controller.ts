import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) { }

  @Get('upcoming')
  findUpcoming(@Query('limit') limit?: string, @GetUser() user?: any) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.remindersService.findUpcoming(user, limitNum);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.remindersService.findByPet(petId, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createReminderDto: CreateReminderDto, @GetUser() user: any) {
    // Handle field name mapping if task_title is missing (PawMD sends title, others may send message)
    if (!createReminderDto.task_title && (createReminderDto as any).title) {
      createReminderDto.task_title = (createReminderDto as any).title;
    }
    if (!createReminderDto.task_title && (createReminderDto as any).message) {
      createReminderDto.task_title = (createReminderDto as any).message;
    }

    // Handle field name mapping if due_date is missing (PawMD sends start_date, others may send reminder_date)
    if (!createReminderDto.due_date && (createReminderDto as any).start_date) {
      createReminderDto.due_date = (createReminderDto as any).start_date;
    }
    if (!createReminderDto.due_date && (createReminderDto as any).reminder_date) {
      createReminderDto.due_date = (createReminderDto as any).reminder_date;
    }

    // Handle field name mapping if task_type is missing but reminder_type is present
    if (!createReminderDto.task_type && (createReminderDto as any).reminder_type) {
      createReminderDto.task_type = (createReminderDto as any).reminder_type as any;
    }

    return this.remindersService.create(createReminderDto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateReminderDto: UpdateReminderDto,
    @GetUser() user: any,
  ) {
    return this.remindersService.update(id, updateReminderDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.remindersService.remove(id, user);
  }
}

