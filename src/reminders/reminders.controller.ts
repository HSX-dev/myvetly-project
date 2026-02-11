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
    return this.remindersService.create(createReminderDto, user);
  }
}

