import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { RemindersService, UpcomingOccurrence } from './reminders.service';
import {
  CreateReminderDto,
  UpdateReminderDto,
  MarkCompleteDto,
  CopyReminderDto,
} from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  /**
   * Create a new reminder
   * POST /reminders
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(CleanDtoPipe) createReminderDto: CreateReminderDto,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.create(createReminderDto, userId);
  }

  /**
   * Get all reminders (admin/debug)
   * GET /reminders
   */
  @Get()
  findAll() {
    return this.remindersService.findAll();
  }

  /**
   * Get upcoming reminders for the current user
   * GET /reminders/upcoming?limit=20&filter=today|upcoming|completed
   */
  @Get('upcoming')
  findUpcoming(
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: 'today' | 'upcoming' | 'completed',
  ): Promise<UpcomingOccurrence[]> {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.remindersService.findUpcoming(userId, limitNum, filter);
  }

  /**
   * Get user's pets (for copy picker)
   * GET /reminders/pets
   */
  @Get('pets')
  getUserPets(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.getUserPets(userId);
  }

  /**
   * Get reminders for a specific pet
   * GET /reminders/pet/:petId
   */
  @Get('pet/:petId')
  findByPet(
    @Param('petId') petId: string,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.findByPet(petId, userId);
  }

  /**
   * Get a single reminder by ID
   * GET /reminders/:id
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.findOne(id, userId);
  }

  /**
   * Update a reminder
   * PATCH /reminders/:id
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateReminderDto: UpdateReminderDto,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.update(id, updateReminderDto, userId);
  }

  /**
   * Delete a reminder
   * DELETE /reminders/:id
   */
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.remove(id, userId);
  }

  /**
   * Mark a reminder occurrence as complete or snoozed
   * POST /reminders/:id/complete
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  markComplete(
    @Param('id') id: string,
    @Body(CleanDtoPipe) markCompleteDto: MarkCompleteDto,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.markComplete(id, markCompleteDto, userId);
  }

  /**
   * Copy a reminder to another pet
   * POST /reminders/:id/copy
   */
  @Post(':id/copy')
  @HttpCode(HttpStatus.CREATED)
  copy(
    @Param('id') id: string,
    @Body(CleanDtoPipe) copyReminderDto: CopyReminderDto,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.remindersService.copy(id, copyReminderDto, userId);
  }
}
