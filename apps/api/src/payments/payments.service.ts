import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OrderStateMachine } from '../orders/domain/order-state-machine';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payments.dto';
import { VnpayPaymentsService } from './vnpay/vnpay-payments.service';

/** Sau khi controller đã hợp nhất header/body, khóa idempotency luôn có mặt. */
export type CreatePaymentInput = CreatePaymentDto & {
  idempotencyKey: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly loyaltyService: LoyaltyService,
    private readonly ordersService: OrdersService,
    private readonly vnpayPayments: VnpayPaymentsService,
  ) {}

  async create(userId: string, dto: CreatePaymentInput, ipAddress = '127.0.0.1') {
    const provider = this.config.get<string>('PAYMENT_PROVIDER', 'mock');
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');

    if (provider === 'vnpay') {
      return this.vnpayPayments.create(userId, dto, ipAddress);
    }
    if (provider !== 'mock') {
      throw new ServiceUnavailableException(
        'Payment provider hiện chưa được triển khai.',
      );
    }

    if (dto.simulateFailure && nodeEnv === 'production') {
      throw new BadRequestException(
        'Không được mô phỏng kết quả thanh toán trong production.',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: {
        orderId: dto.orderId,
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    // Lazy expiry: đơn chưa thanh toán quá hạn bị hủy trước khi xử lý thanh toán.
    if (
      order.status === OrderStatus.PENDING ||
      order.status === OrderStatus.PAYMENT_FAILED
    ) {
      const expired = await this.ordersService.expireOrderIfNeeded(order.orderId);
      if (expired) {
        throw new ConflictException(
          'Đơn hàng đã quá hạn thanh toán và bị hủy tự động. Vui lòng tạo đơn mới.',
        );
      }
    }

    const paymentWhere = {
      userId_orderId_idempotencyKey: {
        userId: order.userId,
        orderId: order.orderId,
        idempotencyKey: dto.idempotencyKey,
      },
    };

    // Retry cùng khóa: trả về payment đã lưu.
    const existing = await this.prisma.payment.findUnique({
      where: paymentWhere,
    });

    if (existing) {
      const latestOrder = await this.prisma.order.findUnique({
        where: { orderId: order.orderId },
        select: { status: true },
      });

      return {
        payment: existing,
        orderStatus: latestOrder?.status ?? order.status,
        reused: true,
      };
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PAYMENT_FAILED
    ) {
      throw new ConflictException(
        `Không thể thanh toán đơn hàng ở trạng thái ${order.status}.`,
      );
    }

    const failed = dto.simulateFailure === true;

    const paymentStatus = failed
      ? PaymentStatus.FAILED
      : PaymentStatus.PAID;

    const nextOrderStatus = failed
      ? OrderStatus.PAYMENT_FAILED
      : OrderStatus.PAID;

    // PAYMENT_FAILED -> PENDING -> PAID | PAYMENT_FAILED.
    if (order.status === OrderStatus.PAYMENT_FAILED) {
      OrderStateMachine.assertTransition(
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.PENDING,
      );
    }

    OrderStateMachine.assertTransition(
      OrderStatus.PENDING,
      nextOrderStatus,
    );

    const transactionReference =
      `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Nếu thanh toán lại, chuyển PAYMENT_FAILED về PENDING trước.
        if (order.status === OrderStatus.PAYMENT_FAILED) {
          const reset = await tx.order.updateMany({
            where: {
              orderId: order.orderId, userId,
              status: OrderStatus.PAYMENT_FAILED,
            },
            data: { status: OrderStatus.PENDING },
          });

          if (reset.count !== 1) {
            throw new ConflictException(
              'Đơn hàng đã được xử lý bởi một yêu cầu khác.',
            );
          }
        }

        // Chỉ một request được phép xử lý đơn PENDING.
        const updated = await tx.order.updateMany({
          where: {
            orderId: order.orderId, userId,
            status: OrderStatus.PENDING,
          },
          data: { status: nextOrderStatus },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Đơn hàng đã được xử lý bởi một yêu cầu khác.',
          );
        }

        const payment = await tx.payment.create({
          data: {
            userId: order.userId,
            orderId: order.orderId,
            idempotencyKey: dto.idempotencyKey,
            amount: new Prisma.Decimal(order.totalAmount.toString()),
            method: dto.method,
            status: paymentStatus,
            transactionReference,
          },
        });

        return {
          payment,
          orderStatus: nextOrderStatus,
          reused: false,
        };
      });

      // Chỉ cộng điểm sau khi transaction thanh toán đã commit.
      if (result.orderStatus === OrderStatus.PAID) {
        await this.earnPointsSafely(
          order.userId,
          order.orderId,
          order.totalAmount,
        );
      }

      return result;
    } catch (error) {
      // Request thua cuộc trong tình huống đồng thời có thể gặp P2002
      // hoặc ConflictException.
      const isRace =
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002');

      if (isRace) {
        const duplicate = await this.prisma.payment.findUnique({
          where: paymentWhere,
        });

        if (duplicate) {
          const latestOrder = await this.prisma.order.findUnique({
            where: { orderId: order.orderId },
            select: { status: true },
          });

          return {
            payment: duplicate,
            orderStatus: latestOrder?.status ?? order.status,
            reused: true,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Cộng điểm sau thanh toán và đối soát nếu đơn bị hủy đồng thời.
   */
  private async earnPointsSafely(
    userId: string,
    orderId: string,
    totalAmount: Prisma.Decimal,
  ): Promise<void> {
    try {
      const amount = totalAmount.toNumber();

      await this.loyaltyService.earnPoints(
        userId,
        orderId,
        amount,
      );

      // Đơn có thể đã bị hủy trong lúc earnPoints thực hiện.
      const latestOrder = await this.prisma.order.findUnique({
        where: { orderId },
        select: { status: true },
      });

      if (latestOrder?.status === OrderStatus.CANCELLED) {
        await this.loyaltyService.reversePoints(userId, orderId);

        this.logger.warn(
          `Đơn ${orderId} đã bị hủy trong lúc cộng điểm. Đã thực hiện đối soát điểm.`,
        );
      }
    } catch (error) {
      // Không rollback payment đã commit chỉ vì lỗi loyalty.
      this.logger.error(
        `Không thể hoàn tất xử lý loyalty cho đơn ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
