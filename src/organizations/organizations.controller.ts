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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(createOrganizationDto);
  }

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get('plans')
  getPlans() {
    return this.organizationsService.getPlans();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Get(':id/clinics')
  getClinics(@Param('id') id: string) {
    return this.organizationsService.getClinicsByOrganization(id);
  }

  @Get(':id/users')
  getUsers(@Param('id') id: string) {
    return this.organizationsService.getUsersByOrganization(id);
  }

  @Get(':id/subscriptions')
  getSubscriptions(@Param('id') id: string) {
    return this.organizationsService.getSubscriptionsByOrganization(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }
}

