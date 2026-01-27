import { Controller, Get, Param } from '@nestjs/common';
import { VaccinationsService } from './vaccinations.service';

@Controller('vaccinations')
export class VaccinationsController {
  constructor(private readonly vaccinationsService: VaccinationsService) {}

  @Get()
  findAll() {
    return this.vaccinationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vaccinationsService.findOne(id);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string) {
    return this.vaccinationsService.findByPet(petId);
  }
}

