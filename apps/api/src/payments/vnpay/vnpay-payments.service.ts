import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus, Prisma, type Payment } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { OrderStateMachine } from '../../orders/domain/order-state-machine';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePaymentInput } from '../payments.service';
import { VnpayService } from './vnpay.service';
import { parseVnpayDate } from './vnpay.protocol';

@Injectable()
export class VnpayPaymentsService {
  private readonly logger = new Logger(VnpayPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vnpay: VnpayService,
    private readonly orders: OrdersService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** Lock the order first in both initiation and confirmation to serialize attempts/cancellation. */
  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT "orderId" FROM "Order" WHERE "orderId" = ${orderId}::uuid FOR UPDATE`;
  }

  private response(payment: Payment, orderStatus: OrderStatus, reused: boolean) {
    return {
      payment,
      orderStatus,
      reused,
      requiresRedirect: payment.status === PaymentStatus.INITIATED &&
        orderStatus === OrderStatus.PENDING &&
        Boolean(payment.expiresAt && payment.expiresAt.getTime() > Date.now()),
      paymentUrl: payment.paymentUrl,
    };
  }

  async create(userId: string, dto: CreatePaymentInput, ipAddress: string) {
    if (dto.simulateFailure) {
      throw new BadRequestException('Không được mô phỏng kết quả khi dùng VNPay.');
    }
    const owned = await this.prisma.order.findFirst({
      where: { orderId: dto.orderId, userId },
    });
    if (!owned) throw new NotFoundException('Không tìm thấy đơn hàng.');
    await this.orders.expireOrderIfNeeded(owned.orderId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, owned.orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { orderId: owned.orderId } });
      const existing = await tx.payment.findUnique({
        where: {
          userId_orderId_idempotencyKey: {
            userId, orderId: order.orderId, idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) return this.response(existing, order.status, true);
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
        throw new ConflictException(`Không thể thanh toán đơn hàng ở trạng thái ${order.status}.`);
      }
      const now = new Date();
      const timeout = this.config.get<number>('ORDER_PAYMENT_TIMEOUT_SECONDS', 900);
      const expiresAt = new Date(Math.min(
        order.createdAt.getTime() + timeout * 1000,
        now.getTime() + 15 * 60 * 1000,
      ));
      if (expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException('Đơn hàng đã quá hạn thanh toán. Vui lòng tạo đơn mới.');
      }
      const active = await tx.payment.findFirst({
        where: { orderId: order.orderId, status: PaymentStatus.INITIATED, provider: 'vnpay' },
      });
      if (active) {
        throw new ConflictException('Đơn đang có giao dịch chờ xác nhận. Vui lòng tiếp tục URL thanh toán hiện tại, không thanh toán lần thứ hai.');
      }
      if (order.status === OrderStatus.PAYMENT_FAILED) {
        OrderStateMachine.assertTransition(order.status, OrderStatus.PENDING);
        await tx.order.update({ where: { orderId: order.orderId }, data: { status: OrderStatus.PENDING } });
      }
      const paymentId = randomUUID();
      const reference = paymentId.replace(/-/g, '');
      const paymentUrl = this.vnpay.buildPaymentUrl({
        reference, amount: order.totalAmount, orderCode: order.orderCode,
        ipAddress, createdAt: now, expiresAt,
      });
      const payment = await tx.payment.create({
        data: {
          paymentId, userId, orderId: order.orderId, idempotencyKey: dto.idempotencyKey,
          amount: order.totalAmount, method: dto.method, provider: 'vnpay',
          providerTxnRef: reference, status: PaymentStatus.INITIATED, paymentUrl, expiresAt,
        },
      });
      return this.response(payment, OrderStatus.PENDING, false);
    });
  }

  async confirmReturn(query: Record<string, unknown>) {
    const data = this.vnpay.verifyReturn(query);
    const found = await this.prisma.payment.findUnique({
      where: { providerTxnRef: data.vnp_TxnRef },
    });
    if (!found || found.provider !== 'vnpay') {
      throw new NotFoundException('Không tìm thấy giao dịch VNPay.');
    }
    if (data.vnp_Amount !== this.vnpay.amountInMinorUnits(found.amount)) {
      throw new BadRequestException('Số tiền VNPay không khớp với giao dịch.');
    }
    const paid = data.vnp_ResponseCode === '00' && data.vnp_TransactionStatus === '00';
    // Conservative policy: an already released reservation is never resurrected.
    await this.orders.expireOrderIfNeeded(found.orderId);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, found.orderId);
      const payment = await tx.payment.findUniqueOrThrow({ where: { paymentId: found.paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { orderId: found.orderId } });
      if (payment.status !== PaymentStatus.INITIATED) {
        if (
          (payment.status === PaymentStatus.PAID) !== paid ||
          payment.responseCode !== data.vnp_ResponseCode ||
          payment.transactionStatus !== data.vnp_TransactionStatus ||
          payment.transactionReference !== data.vnp_TransactionNo
        ) {
          throw new ConflictException('Kết quả VNPay xung đột với giao dịch đã xác nhận.');
        }
        return { order, payment, earn: false };
      }
      const refundRequired = paid && order.status !== OrderStatus.PENDING;
      const updatedPayment = await tx.payment.update({
        where: { paymentId: payment.paymentId },
        data: {
          status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
          transactionReference: data.vnp_TransactionNo,
          responseCode: data.vnp_ResponseCode,
          transactionStatus: data.vnp_TransactionStatus,
          bankCode: data.vnp_BankCode,
          payDate: data.vnp_PayDate ? parseVnpayDate(data.vnp_PayDate) : null,
          refundRequired,
        },
      });
      let updatedOrder = order;
      if (order.status === OrderStatus.PENDING) {
        const next = paid ? OrderStatus.PAID : OrderStatus.PAYMENT_FAILED;
        OrderStateMachine.assertTransition(order.status, next);
        updatedOrder = await tx.order.update({
          where: { orderId: order.orderId }, data: { status: next },
        });
      }
      return { order: updatedOrder, payment: updatedPayment, earn: paid && !refundRequired };
    });

    if (result.payment.refundRequired) {
      this.logger.warn(`VNPAY_REFUND_REQUIRED paymentId=${found.paymentId} orderId=${found.orderId}`);
    }
    if (result.earn) {
      try {
        await this.loyalty.earnPoints(found.userId, found.orderId, found.amount.toNumber());
        const latest = await this.prisma.order.findUnique({ where: { orderId: found.orderId } });
        if (latest?.status === OrderStatus.CANCELLED) {
          await this.loyalty.reversePoints(found.userId, found.orderId);
        }
      } catch {
        this.logger.error(`Không thể hoàn tất loyalty cho paymentId=${found.paymentId}. Thanh toán đã được lưu.`);
      }
    }
    return { orderId: found.orderId, paymentId: found.paymentId };
  }

  async getStatus(userId: string, orderId: string) {
    const owned = await this.prisma.order.findFirst({ where: { orderId, userId } });
    if (!owned) throw new NotFoundException('Không tìm thấy đơn hàng.');
    await this.orders.expireOrderIfNeeded(orderId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { orderId } });
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, userId }, orderBy: [{ createdAt: 'desc' }, { paymentId: 'desc' }],
    });
    return { orderId, orderCode: order.orderCode, orderStatus: order.status, payment };
  }
}
