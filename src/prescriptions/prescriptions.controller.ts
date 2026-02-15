import { Controller, Get, Param, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { AuthGuard } from '../auth/auth.guard';
import { GetUser } from '../utils/decorators/get-user.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('prescriptions')
@UseGuards(AuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get()
  findAll() {
    return this.prescriptionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.findOne(id);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: UserContext) {
    return this.prescriptionsService.findByPet(petId, user);
  }

  @Get('soap/:soapId')
  findBySoapId(@Param('soapId') soapId: string, @GetUser() user: UserContext) {
    return this.prescriptionsService.findBySoapId(soapId, user);
  }

  @Get('medications/species/:speciesId')
  getMedicationsBySpecies(@Param('speciesId') speciesId: string) {
    return this.prescriptionsService.getMedicationsBySpecies(speciesId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPrescription(@Body() createDto: any, @GetUser() user: UserContext) {
    return this.prescriptionsService.createPrescription(createDto, user);
  }
}

