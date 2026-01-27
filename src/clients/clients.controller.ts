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
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';
import { GetUser } from '../utils/decorators/get-user.decorator';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createClientDto: CreateClientDto, @GetUser() user: any) {
    return this.clientsService.create(createClientDto, user);
  }

  @Get()
  findAll(@GetUser() user: any) {
    return this.clientsService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Get(':id/pets')
  getPets(@Param('id') id: string) {
    return this.clientsService.getPetsByClient(id);
  }

  @Get(':id/appointments')
  getAppointments(@Param('id') id: string) {
    return this.clientsService.getAppointmentsByClient(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(CleanDtoPipe) updateClientDto: UpdateClientDto,
    @GetUser() user: any,
  ) {
    return this.clientsService.update(id, updateClientDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.clientsService.remove(id, user);
  }
}

