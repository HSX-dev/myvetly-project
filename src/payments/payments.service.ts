import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { CreatePaymentLinkDto } from './dto';

@Injectable()
export class PaymentsService {
  private stripeSecretKey: string | null = null;
  private stripe: any = null;

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {
    // Initialize Stripe if secret key is available
    this.stripeSecretKey = this.configService.get<string>('stripe.secretKey') || null;
    if (this.stripeSecretKey && !this.stripeSecretKey.includes('[YOUR_')) {
      try {
        // Dynamic import to avoid errors if Stripe is not installed
        // Note: Install stripe package: npm install stripe
        // const Stripe = require('stripe');
        // this.stripe = new Stripe(this.stripeSecretKey);
      } catch (error) {
        console.warn('⚠️  Stripe SDK not available. Payment features will be disabled.');
      }
    }
  }

  /**
   * Create a Stripe Payment Link for an invoice
   * Matches original frontend Edge Function logic exactly
   */
  async createPaymentLink(
    createPaymentLinkDto: CreatePaymentLinkDto,
    user: UserContext,
  ): Promise<{
    success: boolean;
    paymentLink: {
      id: string;
      url: string;
      active: boolean;
    };
  }> {
    // Validate invoice exists and user has access
    const { data: invoice, error: invoiceError } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('id, client_id, amount, tenant_id')
      .eq('id', createPaymentLinkDto.invoiceId)
      .maybeSingle();

    if (invoiceError) {
      console.error('[createPaymentLink] Error fetching invoice:', invoiceError);
      
      // Check if table doesn't exist
      if (invoiceError.message?.includes('relation') && invoiceError.message?.includes('does not exist')) {
        throw new BadRequestException(
          'The invoices table does not exist in the database. Please create the table.',
        );
      }
      
      // Check if invoice not found (PGRST116)
      if (invoiceError.code === 'PGRST116') {
        throw new NotFoundException(`Invoice with ID ${createPaymentLinkDto.invoiceId} not found`);
      }
      
      throw new InternalServerErrorException(
        `Failed to fetch invoice: ${invoiceError.message || 'Unknown error'}`,
      );
    }

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${createPaymentLinkDto.invoiceId} not found`);
    }

    // Validate clinic access (use tenant_id instead of clinic_id)
    if (user.role !== 'super_admin') {
      if (user.clinic_id !== invoice.tenant_id) {
        throw new ForbiddenException('Access denied: Cannot access invoice from other clinic');
      }
    }

    // Use invoice amount if amount not provided, otherwise validate it matches
    const paymentAmount = createPaymentLinkDto.amount ?? invoice.amount ?? 0;
    
    if (createPaymentLinkDto.amount !== undefined) {
      // If amount is provided, validate it matches invoice amount (allow small rounding differences)
      if (Math.abs((invoice.amount || 0) - createPaymentLinkDto.amount) > 0.01) {
        throw new BadRequestException(
          `Amount ${createPaymentLinkDto.amount} does not match invoice total ${invoice.amount || 0}`,
        );
      }
    }
    
    if (paymentAmount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than 0. Invoice amount is missing or invalid.',
      );
    }

    // Check if Stripe is configured
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.',
      );
    }

    try {
      // Get client email if not provided
      let clientEmail = createPaymentLinkDto.clientEmail;
      if (!clientEmail) {
        const { data: client } = await this.supabaseService
          .getClient()
          .from('clients')
          .select('users!clients_user_id_fkey(email)')
          .eq('id', invoice.client_id)
          .single();

        if (client?.users) {
          clientEmail = (client.users as any).email;
        }
      }

      // Create Stripe Payment Link
      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice #${createPaymentLinkDto.invoiceId}`,
                description: createPaymentLinkDto.clientName
                  ? `Payment for ${createPaymentLinkDto.clientName}`
                  : 'Invoice payment',
              },
              unit_amount: Math.round(paymentAmount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        metadata: {
          invoice_id: createPaymentLinkDto.invoiceId,
          clinic_id: invoice.tenant_id, // Use tenant_id as clinic_id in metadata
        },
        ...(clientEmail && { customer_email: clientEmail }),
      });

      // Update invoice with Stripe payment link ID
      await this.supabaseService
        .getClient()
        .from('invoices')
        .update({ stripe_payment_link_id: paymentLink.id })
        .eq('id', createPaymentLinkDto.invoiceId);

      return {
        success: true,
        paymentLink: {
          id: paymentLink.id,
          url: paymentLink.url,
          active: paymentLink.active,
        },
      };
    } catch (error) {
      console.error('Error creating payment link:', error);
      
      // If it's already a NestJS exception, re-throw it
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }

      // For Stripe API errors, throw BadRequestException with clear message
      if (error && typeof error === 'object' && 'type' in error) {
        const stripeError = error as any;
        throw new BadRequestException(
          `Stripe error: ${stripeError.message || stripeError.type || 'Failed to create payment link'}`,
        );
      }

      // For other errors, throw BadRequestException with error message
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to create payment link',
      );
    }
  }
}

