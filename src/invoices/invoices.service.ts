import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { CreateInvoiceDto, UpdateInvoiceDto, CreateInvoiceItemDto, UpdateInvoiceItemDto } from './dto';

@Injectable()
export class InvoicesService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*, clients(*), pets(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Get invoice by ID with full relations (treatments, prescriptions, invoice_items)
   * Matches frontend clinicService.getInvoice logic exactly
   */
  async findOne(id: string, user?: UserContext): Promise<any> {
    const query = this.supabaseService
      .getClient()
      .from('invoices')
      .select(`
        *,
        client:clients!client_id(
          id,
          user_id,
          phone,
          title,
          aka,
          patients:pets!client_id(
            id,
            client_id,
            name
          ),
          user:users!user_id(
            id,
            email,
            status,
            full_name
          )
        )
      `)
      .eq('id', id)
      .single();

    const { data, error } = await query;
    if (error) throw new NotFoundException(`Invoice with id ${id} not found`);

    let invoiceData: any = data;

    // Fetch treatments if they exist
    if (invoiceData.treatments && invoiceData.treatments.length > 0) {
      const { data: treatmentsData, error: treatmentsError } = await this.supabaseService
        .getClient()
        .from('treatment_plans')
        .select(`
          *,
          product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
          created_by_doc:users!created_by(id, full_name)
        `)
        .in('id', invoiceData.treatments)
        .order('created_at', { ascending: false });

      if (treatmentsError) throw new InternalServerErrorException('Failed to fetch treatments');

      invoiceData = {
        ...invoiceData,
        ordered_treatments: treatmentsData,
      };
    }

    // Fetch prescriptions if they exist
    if (invoiceData.prescriptions && invoiceData.prescriptions.length > 0) {
      const { data: prescriptionData, error: prescriptionError } = await this.supabaseService
        .getClient()
        .from('prescriptions')
        .select(`
          *,
          product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
          prescribed_doc:users!prescribed_by(id, full_name)
        `)
        .in('id', invoiceData.prescriptions)
        .order('created_at', { ascending: false });

      if (prescriptionError) throw new InternalServerErrorException('Failed to fetch prescriptions');

      invoiceData = {
        ...invoiceData,
        ordered_prescriptions: prescriptionData,
      };
    }

    // Fetch invoice items if they exist
    if (invoiceData.invoice_items && invoiceData.invoice_items.length > 0) {
      const { data: invoiceItemsData, error: invoiceItemsError } = await this.supabaseService
        .getClient()
        .from('invoice_items')
        .select('*')
        .in('id', invoiceData.invoice_items)
        .order('created_at', { ascending: false });

      if (invoiceItemsError) throw new InternalServerErrorException('Failed to fetch invoice items');

      invoiceData = {
        ...invoiceData,
        added_invoice_items: invoiceItemsData,
      };
    }

    return invoiceData;
  }

  async findByClient(clientId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findByPet(petId: string, user: any) {
    // Validate user has access to this pet's clinic
    const { data: pet, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('tenant_id')
      .eq('id', petId)
      .single();

    if (petError || !pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    // Validate clinic access
    if (pet.tenant_id && user?.clinic_id !== pet.tenant_id) {
      throw new Error('Access denied: You do not have access to this pet');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select(`
        *,
        clients:client_id (
          id,
          users:user_id (
            full_name,
            email
          )
        ),
        appointments:appointment_id (
          id,
          appointment_time,
          service_type,
          pet_id
        )
      `)
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Create a new invoice
   * Matches frontend clinicService.createInvoice logic exactly
   */
  async createInvoice(
    createInvoiceDto: CreateInvoiceDto,
    clientId: string,
    appointmentId: string,
    user: UserContext,
  ): Promise<any> {
    if (!user) throw new BadRequestException('Missing User Data!');
    if (!clientId) throw new BadRequestException('Missing clientId!');
    if (!appointmentId) throw new BadRequestException('Missing appointmentId!');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .insert({
        ...createInvoiceDto,
        appointment_id: appointmentId,
        client_id: clientId,
        tenant_id: user.clinic_id,
        issued_at: new Date().toISOString(),
        issued_by: user.user_id,
      })
      .select('*')
      .single();

    if (error) throw new InternalServerErrorException(`Failed to create invoice: ${error.message}`);

    return data;
  }

  /**
   * Get invoice by appointment ID
   * Matches frontend clinicService.getInvoiceByApptId logic exactly
   */
  async findByAppointmentId(appointmentId: string, user: UserContext): Promise<any | null> {
    if (!appointmentId) throw new BadRequestException('Missing appointment id!');
    if (!user) throw new BadRequestException('Missing User Data!');

    const query = this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 when no rows exist

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to get invoice: ${error.message}`);
    }

    return data as any | null; // maybeSingle() returns null if no rows found
  }

  /**
   * Update invoice
   * Matches frontend clinicService.updateInvoice logic exactly
   */
  async updateInvoice(
    invoiceId: string,
    updateInvoiceDto: UpdateInvoiceDto,
    user: UserContext,
  ): Promise<any> {
    if (!invoiceId) throw new BadRequestException('Missing invoice id!');
    if (!user) throw new BadRequestException('Missing User Data!');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .update(updateInvoiceDto)
      .eq('id', invoiceId)
      .select('*')
      .single();

    if (error) throw new InternalServerErrorException(`Failed to update invoice: ${error.message}`);

    return data;
  }

  /**
   * Update invoice with all data (including relations)
   * Matches frontend clinicService.updateInvoiceWithAllData logic exactly
   */
  async updateInvoiceWithAllData(
    invoiceId: string,
    updateInvoiceDto: UpdateInvoiceDto,
    user: UserContext,
  ): Promise<any> {
    if (!invoiceId) throw new BadRequestException('Missing invoice id!');
    if (!user) throw new BadRequestException('Missing User Data!');

    const query = this.supabaseService
      .getClient()
      .from('invoices')
      .update(updateInvoiceDto)
      .eq('id', invoiceId)
      .select(`
        *,
        client:clients!client_id(
          id,
          user_id,
          phone,
          title,
          aka,
          patients:pets!client_id(
            id,
            client_id,
            name
          ),
          user:users!user_id(
            id,
            email,
            status,
            full_name
          )
        )
      `)
      .single();

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(`Failed to update invoice: ${error.message}`);

    let invoiceData: any = data;

    // Fetch treatments if they exist
    if (invoiceData.treatments && invoiceData.treatments.length > 0) {
      const { data: treatmentsData, error: treatmentsError } = await this.supabaseService
        .getClient()
        .from('treatment_plans')
        .select(`
          *,
          product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
          created_by_doc:users!created_by(id, full_name)
        `)
        .in('id', invoiceData.treatments)
        .order('created_at', { ascending: false });

      if (treatmentsError) throw new InternalServerErrorException('Failed to fetch treatments');

      invoiceData = {
        ...invoiceData,
        ordered_treatments: treatmentsData,
      };
    }

    // Fetch prescriptions if they exist
    if (invoiceData.prescriptions && invoiceData.prescriptions.length > 0) {
      const { data: prescriptionData, error: prescriptionError } = await this.supabaseService
        .getClient()
        .from('prescriptions')
        .select(`
          *,
          product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
          prescribed_doc:users!prescribed_by(id, full_name)
        `)
        .in('id', invoiceData.prescriptions)
        .order('created_at', { ascending: false });

      if (prescriptionError) throw new InternalServerErrorException('Failed to fetch prescriptions');

      invoiceData = {
        ...invoiceData,
        ordered_prescriptions: prescriptionData,
      };
    }

    // Fetch invoice items if they exist
    if (invoiceData.invoice_items && invoiceData.invoice_items.length > 0) {
      const { data: invoiceItemsData, error: invoiceItemsError } = await this.supabaseService
        .getClient()
        .from('invoice_items')
        .select('*')
        .in('id', invoiceData.invoice_items)
        .order('created_at', { ascending: false });

      if (invoiceItemsError) throw new InternalServerErrorException('Failed to fetch invoice items');

      invoiceData = {
        ...invoiceData,
        added_invoice_items: invoiceItemsData,
      };
    }

    return invoiceData;
  }

  /**
   * Create invoice items
   * Matches frontend clinicService.createInvoiceItems logic exactly
   */
  async createInvoiceItems(
    invoiceId: string,
    createInvoiceItemDtos: CreateInvoiceItemDto[],
    user: UserContext,
  ): Promise<any[]> {
    if (!user) throw new BadRequestException('Missing User Data!');

    // Get invoice to get client_id
    const invoice = await this.findOne(invoiceId, user);
    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${invoiceId} not found`);
    }

    // Set invoice_id, client_id, clinic_id, and created_by for each item
    const itemsToInsert = createInvoiceItemDtos.map((dto) => ({
      ...dto,
      invoice_id: invoiceId,
      client_id: dto.client_id || invoice.client_id, // Get from invoice if not provided
      clinic_id: dto.clinic_id || user.clinic_id,
      created_by: dto.created_by || user.user_id,
      patient_id: dto.patient_id === 'none' ? null : dto.patient_id,
    }));

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoice_items')
      .insert(itemsToInsert)
      .select('*');

    if (error) throw new InternalServerErrorException(`Failed to create invoice items: ${error.message}`);

    return data as any[];
  }

  /**
   * Get invoice item by ID
   */
  async findInvoiceItemById(itemId: string): Promise<any> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoice_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (error) throw new NotFoundException(`Invoice item with id ${itemId} not found`);
    return data;
  }

  /**
   * Update invoice item
   */
  async updateInvoiceItem(
    itemId: string,
    updateInvoiceItemDto: UpdateInvoiceItemDto,
    user: UserContext,
  ): Promise<any> {
    if (!itemId) throw new BadRequestException('Missing invoice item id!');
    if (!user) throw new BadRequestException('Missing User Data!');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoice_items')
      .update(updateInvoiceItemDto)
      .eq('id', itemId)
      .select('*')
      .single();

    if (error) throw new InternalServerErrorException(`Failed to update invoice item: ${error.message}`);

    return data;
  }
}

