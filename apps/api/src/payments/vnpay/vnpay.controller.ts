import {
  Controller,
  Get,
  HttpException,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { VnpayPaymentsService } from './vnpay-payments.service';

/** Public routes: Return is authenticated by VNPay's signature, never by a user's JWT. */
@Controller('payments')
export class VnpayController {
  constructor(
    private readonly config: ConfigService,
    private readonly payments: VnpayPaymentsService,
  ) {}

  @Get('config')
  getConfig() {
    return { provider: this.config.get<string>('PAYMENT_PROVIDER', 'mock') };
  }

  @Get('vnpay/return')
  async handleReturn(@Query() query: Record<string, unknown>, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const resultUrl = new URL('/checkout/result', this.config.get<string>('WEB_BASE_URL', 'http://localhost:3001'));
    try {
      if (this.config.get<string>('PAYMENT_PROVIDER', 'mock') !== 'vnpay') {
        throw new ServiceUnavailableException('VNPay chưa được bật.');
      }
      const result = await this.payments.confirmReturn(query);
      resultUrl.searchParams.set('orderId', result.orderId);
    } catch (error) {
      // No unverified order/ref/message from the query is reflected into the redirect.
      if (!(error instanceof HttpException)) throw error;
      resultUrl.searchParams.set('error', 'verification_failed');
    }
    return response.redirect(302, resultUrl.toString());
  }
}
