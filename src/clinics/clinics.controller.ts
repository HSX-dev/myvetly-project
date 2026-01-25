import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto, UpdateClinicDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createClinicDto: CreateClinicDto) {
    return this.clinicsService.create(createClinicDto);
  }

  @Get()
  findAll() {
    return this.clinicsService.findAll();
  }

  // More specific routes must come before parameterized routes
  @Get(':id/branding')
  getBranding(@Param('id') id: string, @GetUser() user: any) {
    console.log('getBranding called with id:', id, 'user:', user?.id);
    return this.clinicsService.getBranding(id, user);
  }

  @Get(':id/users')
  getUsers(@Param('id') id: string, @GetUser() user: any) {
    return this.clinicsService.getUsersByClinic(id, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clinicsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateClinicDto: UpdateClinicDto,
  ) {
    return this.clinicsService.update(id, updateClinicDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clinicsService.remove(id);
  }
}

