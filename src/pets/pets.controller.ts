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
import { PetsService } from './pets.service';
import { CreatePetDto, UpdatePetDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createPetDto: CreatePetDto) {
    return this.petsService.create(createPetDto);
  }

  @Get()
  findAll() {
    return this.petsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.petsService.findOne(id);
  }

  @Get(':id/medical-records')
  getMedicalRecords(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.petsService.getMedicalRecords(id, limit ? parseInt(limit) : 10);
  }

  @Get(':id/appointments')
  getAppointments(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.petsService.getAppointments(id, limit ? parseInt(limit) : 5);
  }

  @Get(':id/vaccinations')
  getVaccinations(@Param('id') id: string) {
    return this.petsService.getVaccinations(id);
  }

  @Get(':id/medications')
  getMedications(@Param('id') id: string) {
    return this.petsService.getMedications(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(id, updatePetDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.petsService.remove(id);
  }
}

