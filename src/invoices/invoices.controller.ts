import { Controller, Get, Param } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.invoicesService.findByClient(clientId);
  }

  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.invoicesService.findByPet(petId, user);
  }
}

