
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OrderStateMachine } from '../orders/domain/order-state-machine';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { VnpayPaymentsService } from './vnpay/vnpay-payments.service';

describe('PaymentsService + OrderStateMachine (FR-06, FR-08, FR-10)', () => {
  let service: PaymentsService;

  let mockLoyaltyService: {
    earnPoints: jest.Mock;
    reversePoints: jest.Mock;
    getPoints: jest.Mock;
  };
  let mockOrdersService: {
    expireOrderIfNeeded: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
    order: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    payment: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  const orderWith = (status: OrderStatus) => ({
    orderId: 'order-1',
    userId: 'user-1',
    status,
    totalAmount: new Prisma.Decimal(45000),
  });

  const dto = {
    orderId: 'order-1',
    method: PaymentMethod.WALLET,
    idempotencyKey: 'key-1',
  };

  const userId = 'user-1';

  beforeEach(async () => {
    mockLoyaltyService = {
      earnPoints: jest.fn().mockResolvedValue({
        transactionId: 'tx-1',
        points: 4,
      }),
      reversePoints: jest.fn().mockResolvedValue({
        transactionId: 'tx-2',
        points: -4,
      }),
      getPoints: jest.fn(),
    };

    mockOrdersService = {
      // Mặc định đơn chưa quá hạn.
      expireOrderIfNeeded: jest.fn().mockResolvedValue(false),
    };

    prisma = {
      $transaction: jest.fn().mockImplementation(async (callback) =>
        callback(prisma),
      ),
      order: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          paymentId: 'pay-1',
          ...data,
        })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: VnpayPaymentsService, useValue: { create: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: LoyaltyService, useValue: mockLoyaltyService },
        { provide: OrdersService, useValue: mockOrdersService },
        // Dùng giá trị mặc định: PAYMENT_PROVIDER = mock, NODE_ENV = development.
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, fallback?: unknown) => fallback,
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('thanh toán thành công: PENDING -> PAID và cộng điểm', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );
    prisma.order.findUnique.mockResolvedValue(
      orderWith(OrderStatus.PAID),
    );

    const assertSpy = jest.spyOn(
      OrderStateMachine,
      'assertTransition',
    );

    const result = await service.create(userId, dto);

    expect(result.orderStatus).toBe(OrderStatus.PAID);
    expect(result.reused).toBe(false);

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: dto.orderId,
        userId,
      },
    });

    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        status: OrderStatus.PENDING,
        userId,
      },
      data: { status: OrderStatus.PAID },
    });

    expect(prisma.payment.create.mock.calls[0][0].data.status).toBe(
      PaymentStatus.PAID,
    );

    expect(assertSpy).toHaveBeenCalledWith(
      OrderStatus.PENDING,
      OrderStatus.PAID,
    );

    expect(mockLoyaltyService.earnPoints).toHaveBeenCalledWith(
      userId,
      'order-1',
      45000,
    );

    expect(mockLoyaltyService.reversePoints).not.toHaveBeenCalled();
  });

  it('thanh toán thất bại: PENDING -> PAYMENT_FAILED, không cộng điểm', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );

    const assertSpy = jest.spyOn(
      OrderStateMachine,
      'assertTransition',
    );

    const result = await service.create(userId, {
      ...dto,
      simulateFailure: true,
    });

    expect(result.orderStatus).toBe(OrderStatus.PAYMENT_FAILED);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        status: OrderStatus.PENDING,
        userId,
      },
      data: { status: OrderStatus.PAYMENT_FAILED },
    });

    expect(prisma.payment.create.mock.calls[0][0].data.status).toBe(
      PaymentStatus.FAILED,
    );

    expect(assertSpy).toHaveBeenCalledWith(
      OrderStatus.PENDING,
      OrderStatus.PAYMENT_FAILED,
    );

    expect(mockLoyaltyService.earnPoints).not.toHaveBeenCalled();
    expect(mockLoyaltyService.reversePoints).not.toHaveBeenCalled();
  });

  it('thử lại sau thất bại: PAYMENT_FAILED -> PENDING -> PAID', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PAYMENT_FAILED),
    );
    prisma.order.findUnique.mockResolvedValue(
      orderWith(OrderStatus.PAID),
    );

    const assertSpy = jest.spyOn(
      OrderStateMachine,
      'assertTransition',
    );

    const result = await service.create(userId, {
      ...dto,
      idempotencyKey: 'key-2',
    });

    expect(result.orderStatus).toBe(OrderStatus.PAID);

    expect(prisma.order.updateMany).toHaveBeenCalledTimes(2);

    expect(prisma.order.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        orderId: 'order-1',
        status: OrderStatus.PAYMENT_FAILED,
        userId,
      },
      data: { status: OrderStatus.PENDING },
    });

    expect(prisma.order.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        orderId: 'order-1',
        status: OrderStatus.PENDING,
        userId,
      },
      data: { status: OrderStatus.PAID },
    });

    expect(assertSpy).toHaveBeenCalledWith(
      OrderStatus.PAYMENT_FAILED,
      OrderStatus.PENDING,
    );

    expect(assertSpy).toHaveBeenCalledWith(
      OrderStatus.PENDING,
      OrderStatus.PAID,
    );

    expect(mockLoyaltyService.earnPoints).toHaveBeenCalledTimes(1);
  });

  it('đơn bị hủy trong lúc cộng điểm: gọi reversePoints để đối soát', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );

    prisma.order.findUnique
      .mockResolvedValueOnce(orderWith(OrderStatus.CANCELLED));

    const result = await service.create(userId, dto);

    expect(result.orderStatus).toBe(OrderStatus.PAID);

    expect(mockLoyaltyService.earnPoints).toHaveBeenCalledTimes(1);

    expect(mockLoyaltyService.reversePoints).toHaveBeenCalledWith(
      userId,
      'order-1',
    );
  });

  it('lỗi khi cộng điểm không làm thất bại thanh toán đã commit', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );

    mockLoyaltyService.earnPoints.mockRejectedValue(
      new Error('Loyalty service unavailable'),
    );

    const result = await service.create(userId, dto);

    expect(result.orderStatus).toBe(OrderStatus.PAID);
    expect(result.reused).toBe(false);

    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(mockLoyaltyService.earnPoints).toHaveBeenCalledTimes(1);
    expect(mockLoyaltyService.reversePoints).not.toHaveBeenCalled();
  });

  it.each([
    OrderStatus.PAID,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
  ])('không cho thanh toán đơn ở trạng thái %s', async (status) => {
    prisma.order.findFirst.mockResolvedValue(orderWith(status));

    await expect(
      service.create(userId, dto),
    ).rejects.toThrow(ConflictException);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('không tìm thấy đơn hàng thì trả về NotFoundException', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.create(userId, dto),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('không cho phép thanh toán đơn hàng của người dùng khác', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-2', dto),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: dto.orderId,
        userId: 'user-2',
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('OrderStateMachine từ chối thì không ghi dữ liệu xuống DB', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );

    jest
      .spyOn(OrderStateMachine, 'assertTransition')
      .mockImplementation(() => {
        throw new BadRequestException(
          'Chuyển đổi trạng thái đơn hàng không hợp lệ',
        );
      });

    await expect(
      service.create(userId, dto),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('gửi lại cùng Idempotency-Key: trả payment đã lưu', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PAID),
    );

    prisma.payment.findUnique.mockResolvedValue({
      paymentId: 'pay-1',
      status: PaymentStatus.PAID,
    });

    const result = await service.create(userId, dto);

    expect(result.reused).toBe(true);
    expect(result.orderStatus).toBe(OrderStatus.PAID);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(mockLoyaltyService.earnPoints).not.toHaveBeenCalled();
  });

  it('request khác vừa đổi trạng thái đơn thì từ chối và không tạo payment', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderWith(OrderStatus.PENDING),
    );

    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.create(userId, dto),
    ).rejects.toThrow(ConflictException);

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(mockLoyaltyService.earnPoints).not.toHaveBeenCalled();
  });

  it('POST /payments sau deadline: đơn bị hủy và trả 409, không tạo payment', async () => {
    prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PENDING));
    mockOrdersService.expireOrderIfNeeded.mockResolvedValue(true);

    await expect(service.create(userId, dto)).rejects.toThrow(ConflictException);

    expect(mockOrdersService.expireOrderIfNeeded).toHaveBeenCalledWith('order-1');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
