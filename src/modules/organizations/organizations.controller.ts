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
  Request,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { UserContext } from '../auth/auth.guard';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(createOrganizationDto);
  }

  @Get()
  findAll(@Request() req: { user: UserContext }) {
    return this.organizationsService.findAll(req.user);
  }

  @Get('plans')
  getPlans() {
    return this.organizationsService.getPlans();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.organizationsService.findOne(id, req.user);
  }

  @Get(':id/clinics')
  getClinics(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.organizationsService.getClinicsByOrganization(id, req.user);
  }

  @Get(':id/users')
  getUsers(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.organizationsService.getUsersByOrganization(id, req.user);
  }

  @Get(':id/subscriptions')
  getSubscriptions(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.organizationsService.getSubscriptionsByOrganization(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateOrganizationDto: UpdateOrganizationDto,
    @Request() req: { user: UserContext },
  ) {
    return this.organizationsService.update(id, updateOrganizationDto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }
}

