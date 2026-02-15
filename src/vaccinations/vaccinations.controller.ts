import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { VaccinationsService } from './vaccinations.service';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { UserContext } from '../auth/auth.guard';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('vaccinations')
@UseGuards(AuthGuard)
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
  findByPet(@Param('petId') petId: string, @GetUser() user: UserContext) {
    return this.vaccinationsService.findByPet(petId, user);
  }

  @Get('species/:speciesName')
  getVaccinesBySpecies(@Param('speciesName') speciesName: string) {
    return this.vaccinationsService.getVaccinesBySpecies(speciesName);
  }

  @Post()
  create(@Body(CleanDtoPipe) createVaccinationDto: CreateVaccinationDto, @GetUser() user: UserContext) {
    // Handle field name mapping if vaccination_name is missing but vaccine_name is present
    if (!createVaccinationDto.vaccination_name && (createVaccinationDto as any).vaccine_name) {
      createVaccinationDto.vaccination_name = (createVaccinationDto as any).vaccine_name;
    }
    
    return this.vaccinationsService.create(createVaccinationDto, user);
  }
}

