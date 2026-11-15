import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isIP } from 'node:net';
import {
  encodeVnpayParameters,
  formatVnpayDate,
  parseVnpayDate,
  signVnpayParameters,
  verifyVnpaySignature,
  type VnpayParameters,
} from './vnpay.protocol';

@Injectable()
export class VnpayService {
  constructor(private readonly config: ConfigService) {}

  amountInMinorUnits(amount: Prisma.Decimal): string {
    const minor = amount.mul(100);
    if (!amount.isInteger() || !amount.greaterThan(0) || minor.greaterThan('999999999999')) {
      throw new BadRequestException('VNPay yêu cầu số tiền nguyên VNĐ, lớn hơn 0 và trong giới hạn cho phép.');
    }
    return minor.toFixed(0);
  }

  private signature(parameters: VnpayParameters): string {
    return signVnpayParameters(parameters, this.config.getOrThrow<string>('VNPAY_HASH_SECRET'));
  }

  buildPaymentUrl(input: {
    reference: string;
    amount: Prisma.Decimal;
    orderCode: string;
    ipAddress: string;
    createdAt: Date;
    expiresAt: Date;
  }): string {
    const ip = input.ipAddress.replace(/^::ffff:/, '');
    const parameters: VnpayParameters = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.getOrThrow<string>('VNPAY_TMN_CODE'),
      vnp_Amount: this.amountInMinorUnits(input.amount),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.reference,
      vnp_OrderInfo: `Thanh toan BrewLite ${input.orderCode}`.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 255),
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: this.config.getOrThrow<string>('VNPAY_RETURN_URL'),
      vnp_IpAddr: isIP(ip) ? ip : '127.0.0.1',
      vnp_CreateDate: formatVnpayDate(input.createdAt),
      vnp_ExpireDate: formatVnpayDate(input.expiresAt),
    };
    const base = this.config.get<string>(
      'VNPAY_PAY_URL',
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );
    return `${base}?${encodeVnpayParameters(parameters)}&vnp_SecureHash=${this.signature(parameters)}`;
  }

  /** Reject duplicate/nested parameters before looking up or modifying a payment. */
  verifyReturn(query: Record<string, unknown>): VnpayParameters {
    let parameters: VnpayParameters;
    try {
      parameters = verifyVnpaySignature(query, this.config.getOrThrow<string>('VNPAY_HASH_SECRET'));
    } catch {
      throw new BadRequestException('Chữ ký hoặc tham số VNPay không hợp lệ.');
    }
    if (
      parameters.vnp_TmnCode !== this.config.getOrThrow<string>('VNPAY_TMN_CODE') ||
      !/^[a-zA-Z0-9]{1,64}$/.test(parameters.vnp_TxnRef ?? '') ||
      !/^\d{1,12}$/.test(parameters.vnp_Amount ?? '') ||
      !/^\d{2}$/.test(parameters.vnp_ResponseCode ?? '') ||
      !/^\d{2}$/.test(parameters.vnp_TransactionStatus ?? '') ||
      !/^\d{1,15}$/.test(parameters.vnp_TransactionNo ?? '') ||
      (parameters.vnp_BankCode !== undefined && !/^[a-zA-Z0-9]{3,20}$/.test(parameters.vnp_BankCode))
    ) {
      throw new BadRequestException('Thông tin trả về từ VNPay không hợp lệ.');
    }
    const success = parameters.vnp_ResponseCode === '00' && parameters.vnp_TransactionStatus === '00';
    if (success && (!parameters.vnp_PayDate || /^0+$/.test(parameters.vnp_TransactionNo))) {
      throw new BadRequestException('Thiếu thông tin xác nhận thanh toán VNPay.');
    }
    if (parameters.vnp_PayDate) {
      try {
        parseVnpayDate(parameters.vnp_PayDate);
      } catch {
        throw new BadRequestException('Thời điểm thanh toán VNPay không hợp lệ.');
      }
    }
    if (
      parameters.vnp_ResponseCode === '07' ||
      (!success && !['02', '03'].includes(parameters.vnp_TransactionStatus))
    ) {
      throw new BadRequestException('Giao dịch cần đối soát, không được tự động coi là thất bại.');
    }
    return parameters;
  }
}
