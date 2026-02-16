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
  InternalServerErrorException,
} from '@nestjs/common';
import { PetsService } from './pets.service';
import { CreatePetDto, UpdatePetDto } from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(CleanDtoPipe) createPetDto: CreatePetDto,
    @GetUser() user: any,
  ) {
    return this.petsService.create(createPetDto, user);
  }

  @Get()
  findAll(@Query('clinicId') clinicId?: string, @GetUser() user?: any) {
    if (clinicId && user) {
      return this.petsService.findByClinic(clinicId, user);
    }
    // If no clinicId, use user's clinic (requires user to be authenticated)
    if (user) {
      return this.petsService.findAll(user);
    }
    // Should not reach here due to AuthGuard, but for type safety
    throw new InternalServerErrorException('User context required. This should not happen - authentication may have failed.');
  }

  @Get('species')
  @Public() // Public endpoint - no authentication required
  getSpecies() {
    return this.petsService.getSpecies();
  }

  @Get('breeds')
  @Public() // Public endpoint - no authentication required
  getBreeds(@Query('speciesId') speciesId?: string) {
    if (speciesId) {
      return this.petsService.getBreedsBySpecies(speciesId);
    }
    return this.petsService.getAllBreeds();
  }

  @Get('clinic/:clinicId')
  findByClinic(@Param('clinicId') clinicId: string, @GetUser() user: any) {
    // Log for debugging
    if (!user) {
      console.error('User context is missing in findByClinic');
      throw new InternalServerErrorException('User context is missing. Authentication may have failed.');
    }
    console.log('findByClinic called with user:', {
      id: user.id,
      clinic_id: user.clinic_id,
      role: user.role
    });
    return this.petsService.findByClinic(clinicId, user);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.petsService.findByClient(clientId);
  }

  @Get('with-visits/:clinicId')
  findWithVisits(@Param('clinicId') clinicId: string, @GetUser() user: any) {
    return this.petsService.findWithVisits(clinicId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.petsService.findOne(id, user);
  }

  @Get(':id/with-owner')
  findOneWithOwner(@Param('id') id: string, @GetUser() user: any) {
    return this.petsService.findOneWithOwner(id, user);
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
    @GetUser() user: any,
  ) {
    return this.petsService.update(id, updatePetDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.petsService.remove(id, user);
  }
}

