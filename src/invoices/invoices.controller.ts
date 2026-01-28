import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CreateInvoiceDto, UpdateInvoiceDto, CreateInvoiceItemDto, UpdateInvoiceItemDto } from './dto';

@Controller('invoices')
@UseGuards(AuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  /**
   * Create a new invoice
   * POST /api/invoices/client/:clientId/appointment/:appointmentId
   * More specific routes must come BEFORE less specific routes
   */
  @Post('client/:clientId/appointment/:appointmentId')
  @HttpCode(HttpStatus.CREATED)
  createInvoice(
    @Param('clientId') clientId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req: { user: UserContext },
  ) {
    return this.invoicesService.createInvoice(createInvoiceDto, clientId, appointmentId, req.user);
  }

  /**
   * Get invoice by appointment ID
   * GET /api/invoices/appointment/:appointmentId
   * More specific route must come BEFORE less specific routes
   */
  @Get('appointment/:appointmentId')
  findByAppointmentId(
    @Param('appointmentId') appointmentId: string,
    @Request() req: { user: UserContext },
  ) {
    return this.invoicesService.findByAppointmentId(appointmentId, req.user);
  }

  /**
   * Get invoices by client ID
   * GET /api/invoices/client/:clientId
   * More specific route must come BEFORE less specific routes
   */
  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.invoicesService.findByClient(clientId);
  }

  /**
   * Create invoice items
   * POST /api/invoices/:id/items
   * More specific route must come BEFORE less specific routes
   */
  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  createInvoiceItems(
    @Param('id') invoiceId: string,
    @Body() createInvoiceItemDtos: CreateInvoiceItemDto[],
    @Request() req: { user: UserContext },
  ) {
    // Set client_id from the invoice if not provided
    return this.invoicesService.createInvoiceItems(invoiceId, createInvoiceItemDtos, req.user);
  }

  /**
   * Get invoice item by ID
   * GET /api/invoices/items/:itemId
   * More specific route must come BEFORE less specific routes
   */
  @Get('items/:itemId')
  findInvoiceItemById(@Param('itemId') itemId: string) {
    return this.invoicesService.findInvoiceItemById(itemId);
  }

  /**
   * Update invoice item
   * PATCH /api/invoices/items/:itemId
   * More specific route must come BEFORE less specific routes
   */
  @Patch('items/:itemId')
  updateInvoiceItem(
    @Param('itemId') itemId: string,
    @Body() updateInvoiceItemDto: UpdateInvoiceItemDto,
    @Request() req: { user: UserContext },
  ) {
    return this.invoicesService.updateInvoiceItem(itemId, updateInvoiceItemDto, req.user);
  }

  /**
   * Get invoice by ID with full relations
   * GET /api/invoices/:id
   * Less specific route - must come AFTER more specific routes
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user: UserContext }) {
    return this.invoicesService.findOne(id, req.user);
  }

  /**
   * Update invoice
   * PATCH /api/invoices/:id
   * Less specific route - must come AFTER more specific routes
   */
  @Patch(':id')
  updateInvoice(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @Request() req: { user: UserContext },
  ) {
    return this.invoicesService.updateInvoice(id, updateInvoiceDto, req.user);
  }

  /**
   * Update invoice with all data (including relations)
   * PATCH /api/invoices/:id/all
   * More specific route must come BEFORE less specific routes
   */
  @Patch(':id/all')
  updateInvoiceWithAllData(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @Request() req: { user: UserContext },
  ) {
    return this.invoicesService.updateInvoiceWithAllData(id, updateInvoiceDto, req.user);
  }

  /**
   * Get invoices by pet ID
   * GET /api/invoices/pet/:petId
   * More specific route must come BEFORE less specific routes
   */
  @Get('pet/:petId')
  findByPet(@Param('petId') petId: string, @GetUser() user: any) {
    return this.invoicesService.findByPet(petId, user);
  }
}

