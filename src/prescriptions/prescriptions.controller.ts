import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { AuthGuard } from '../auth/auth.guard';
import { GetUser } from '../utils/decorators/get-user.decorator';

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
  findByPet(@Param('petId') petId: string) {
    return this.prescriptionsService.findByPet(petId);
  }

  @Get('soap/:soapId')
  findBySoapId(@Param('soapId') soapId: string, @GetUser() user: any) {
    return this.prescriptionsService.findBySoapId(soapId, user);
  }
}

