import { Controller, Get, Param } from '@nestjs/common';
import { LabsService } from './labs.service';

@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Get()
  findAll() {
    return this.labsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.labsService.findOne(id);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string) {
    return this.labsService.findByPet(petId);
  }
}

