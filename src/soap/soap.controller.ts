import { Controller, Get, Param } from '@nestjs/common';
import { SoapService } from './soap.service';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('soap')
export class SoapController {
  constructor(private readonly soapService: SoapService) {}

  // More specific routes must come before generic parameterized routes
  @Get('pet/:petId/audit/latest')
  getSOAPAuditLatest(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPAuditLatest(petId, user);
  }

  @Get('pet/:petId/audit')
  getSOAPAudit(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPAudit(petId, user);
  }

  @Get('pet/:petId')
  getSOAPByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.soapService.getSOAPByPet(petId, user);
  }
}

