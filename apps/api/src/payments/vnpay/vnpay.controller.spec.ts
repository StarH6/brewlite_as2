import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { VnpayController } from './vnpay.controller';
import { VnpayPaymentsService } from './vnpay-payments.service';

describe('VNPay public Return controller', () => {
  const payments = { confirmReturn: jest.fn() };
  const config = new ConfigService({
    PAYMENT_PROVIDER: 'vnpay', WEB_BASE_URL: 'http://localhost:3001',
    VNPAY_HASH_SECRET: 'not-exposed',
  });
  const controller = new VnpayController(config, payments as unknown as VnpayPaymentsService);
  const response = { setHeader: jest.fn(), redirect: jest.fn() };

  beforeEach(() => jest.resetAllMocks());

  it('exposes only provider configuration, never credentials', () => {
    expect(controller.getConfig()).toEqual({ provider: 'vnpay' });
  });

  it('redirects to a fixed web origin using only the verified order id', async () => {
    payments.confirmReturn.mockResolvedValueOnce({ orderId: 'verified-order', paymentId: 'payment-1' });
    await controller.handleReturn({
      orderId: 'unverified-order', redirect: 'https://evil.example',
    }, response as unknown as Response);
    expect(response.redirect).toHaveBeenCalledWith(
      302, 'http://localhost:3001/checkout/result?orderId=verified-order',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('invalid Return cannot reflect a query orderId or error message into the redirect', async () => {
    payments.confirmReturn.mockRejectedValueOnce(new BadRequestException('invalid signature'));
    await controller.handleReturn({ orderId: 'untrusted' }, response as unknown as Response);
    expect(response.redirect).toHaveBeenCalledWith(
      302, 'http://localhost:3001/checkout/result?error=verification_failed',
    );
  });

  it('does not swallow database/programming errors as payment failure', async () => {
    payments.confirmReturn.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(controller.handleReturn({}, response as unknown as Response)).rejects.toThrow('database unavailable');
    expect(response.redirect).not.toHaveBeenCalled();
  });
});
