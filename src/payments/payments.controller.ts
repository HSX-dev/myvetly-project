import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentLinkDto } from './dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserContext } from '../auth/auth.guard';
import { CleanDtoPipe } from '../utils/pipes/clean-dto.pipe';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create a Stripe Payment Link for an invoice
   * POST /api/payments/create-link
   */
  @Post('create-link')
  @HttpCode(HttpStatus.OK)
  createPaymentLink(
    @Body(CleanDtoPipe) createPaymentLinkDto: CreatePaymentLinkDto,
    @Request() req: { user: UserContext },
  ) {
    return this.paymentsService.createPaymentLink(createPaymentLinkDto, req.user);
  }
}


