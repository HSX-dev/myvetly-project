import { Controller, Get, Param } from '@nestjs/common';
import { CommunicationService } from './communication.service';

@Controller('communication')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Get()
  findAll() {
    return this.communicationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communicationService.findOne(id);
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.communicationService.findByUser(userId);
  }
}

