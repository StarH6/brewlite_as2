import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { signVnpayParameters } from './vnpay.protocol';
import { VnpayService } from './vnpay.service';

describe('VnpayService (sandbox, Return only)', () => {
  const secret = 'sandbox-test-secret';
  const config = new ConfigService({
    VNPAY_TMN_CODE: 'TEST1234',
    VNPAY_HASH_SECRET: secret,
    VNPAY_RETURN_URL: 'http://localhost:3000/payments/vnpay/return',
  });
  const service = new VnpayService(config);
  const returnData = {
    vnp_TmnCode: 'TEST1234',
    vnp_TxnRef: 'a'.repeat(32),
    vnp_Amount: '4500000',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_TransactionNo: '123456',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20261114103000',
  };
  const sign = (data = returnData) => ({
    ...data, vnp_SecureHash: signVnpayParameters(data, secret),
  });

  it('builds a signed URL using Decimal money, GMT+7 and a fixed Return URL', () => {
    const url = new URL(service.buildPaymentUrl({
      reference: 'a'.repeat(32), amount: new Prisma.Decimal(45000),
      orderCode: 'BL-TEST', ipAddress: '::ffff:127.0.0.1',
      createdAt: new Date('2026-11-14T03:00:00Z'),
      expiresAt: new Date('2026-11-14T03:15:00Z'),
    }));
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_Amount')).toBe('4500000');
    expect(url.searchParams.get('vnp_CreateDate')).toBe('20261114100000');
    expect(url.searchParams.get('vnp_ExpireDate')).toBe('20261114101500');
    expect(url.searchParams.get('vnp_IpAddr')).toBe('127.0.0.1');
    expect(url.searchParams.get('vnp_ReturnUrl')).toBe('http://localhost:3000/payments/vnpay/return');
    const parameters = Object.fromEntries(url.searchParams);
    const hash = parameters.vnp_SecureHash;
    delete parameters.vnp_SecureHash;
    expect(hash).toBe(signVnpayParameters(parameters, secret));
  });

  it.each(['0', '-1', '0.5', '100.01', '10000000000'])('rejects unsupported amount %s', (amount) => {
    expect(() => service.amountInMinorUnits(new Prisma.Decimal(amount))).toThrow(BadRequestException);
  });

  it('accepts a signed successful Return', () => {
    expect(service.verifyReturn(sign())).toEqual(returnData);
  });

  it('rejects tampering and a signed callback for another merchant', () => {
    expect(() => service.verifyReturn({ ...sign(), vnp_Amount: '100' })).toThrow(BadRequestException);
    expect(() => service.verifyReturn(sign({ ...returnData, vnp_TmnCode: 'OTHER123' }))).toThrow(BadRequestException);
  });

  it('requires both success codes and a real transaction number/date', () => {
    expect(service.verifyReturn(sign({
      ...returnData, vnp_ResponseCode: '24', vnp_TransactionStatus: '02',
    })).vnp_ResponseCode).toBe('24');
    expect(() => service.verifyReturn(sign({ ...returnData, vnp_TransactionNo: '0' }))).toThrow(BadRequestException);
    expect(() => service.verifyReturn(sign({ ...returnData, vnp_PayDate: '' }))).toThrow(BadRequestException);
    expect(() => service.verifyReturn(sign({ ...returnData, vnp_ResponseCode: '07' }))).toThrow(BadRequestException);
  });
});
