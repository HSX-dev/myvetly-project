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
import { CreateClientDto, UpdateClientDto, CreateClientNoteDto, UpdateClientNoteDto } from './dto';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { GetUser } from '../../utils/decorators/get-user.decorator';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(CleanDtoPipe) createClientDto: CreateClientDto, @GetUser() user: any) {
    return this.clientsService.create(createClientDto, user);
  }

  @Get()
  findAll(@GetUser() user: any) {
    return this.clientsService.findAll(user);
  }

  @Get('deleted')
  findAllIncludingDeleted(@GetUser() user: any) {
    return this.clientsService.findAllIncludingDeleted(user);
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string) {
    return this.clientsService.findByUserId(userId);
  }

  // Client Notes Routes - Must be before :id route to avoid conflicts
  @Get(':id/notes')
  getClientNotes(@Param('id') id: string) {
    return this.clientsService.getClientNotes(id);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  createClientNote(
    @Param('id') clientId: string,
    @Body() createNoteDto: CreateClientNoteDto,
    @GetUser() user: any,
  ) {
    // Set client_id from URL parameter, and clinic_id from user context
    // These are required but come from sources other than the request body
    createNoteDto.client_id = clientId;
    if (user?.clinic_id) {
      createNoteDto.clinic_id = user.clinic_id;
    }
    return this.clientsService.createClientNote(createNoteDto, user);
  }

  @Patch('notes/:noteId')
  updateClientNote(
    @Param('noteId') noteId: string,
    @Body() updateNoteDto: UpdateClientNoteDto, // Remove CleanDtoPipe to preserve empty strings for validation
  ) {
    return this.clientsService.updateClientNote(noteId, updateNoteDto);
  }

  @Delete('notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteClientNote(@Param('noteId') noteId: string) {
    return this.clientsService.deleteClientNote(noteId);
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

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id') id: string, @GetUser() user: any) {
    return this.clientsService.restore(id, user);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  hardDelete(@Param('id') id: string, @GetUser() user: any) {
    return this.clientsService.hardDelete(id, user);
  }
}

