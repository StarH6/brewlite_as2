import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, type Order, type Payment } from '@prisma/client';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { signVnpayParameters } from './vnpay.protocol';
import { VnpayPaymentsService } from './vnpay-payments.service';
import { VnpayService } from './vnpay.service';

describe('VNPay initiation + signed Return', () => {
  const secret = 'sandbox-test-secret';
  const userId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  const config = new ConfigService({
    VNPAY_TMN_CODE: 'TEST1234', VNPAY_HASH_SECRET: secret,
    VNPAY_RETURN_URL: 'http://localhost:3000/payments/vnpay/return',
    ORDER_PAYMENT_TIMEOUT_SECONDS: 900,
  });
  let order: Order;
  let payments: Payment[];
  let service: VnpayPaymentsService;
  const loyalty = { earnPoints: jest.fn(), reversePoints: jest.fn() };
  const orders = { expireOrderIfNeeded: jest.fn() };
  const dto = { orderId, method: PaymentMethod.CARD, idempotencyKey: 'attempt-1' };

  const db = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    order: {
      findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(),
      create: jest.fn(), update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    order = {
      orderId, userId, orderCode: 'BL-TEST', promotionId: null,
      subtotal: new Prisma.Decimal(45000), discountAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(45000), status: OrderStatus.PENDING,
      createdAt: new Date(), cancelReason: null, cancelledAt: null, cancelledBy: null,
    };
    payments = [];
    // Same ordering as PostgreSQL's per-order row lock, for deterministic race tests.
    let tail: Promise<unknown> = Promise.resolve();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => Promise<unknown>) => {
      const pending = tail.then(() => callback(db));
      tail = pending.catch(() => undefined);
      return pending;
    });
    db.$queryRaw.mockResolvedValue([]);
    db.order.findFirst.mockImplementation(async ({ where }) =>
      where.userId === userId && where.orderId === orderId ? { ...order } : null);
    db.order.findUnique.mockImplementation(async () => ({ ...order }));
    db.order.findUniqueOrThrow.mockImplementation(async () => ({ ...order }));
    db.order.update.mockImplementation(async ({ data }) => {
      Object.assign(order, data);
      return { ...order };
    });
    db.payment.findUnique.mockImplementation(async ({ where }) => payments.find((payment) =>
      where.providerTxnRef ? payment.providerTxnRef === where.providerTxnRef :
        where.userId_orderId_idempotencyKey ?
          payment.idempotencyKey === where.userId_orderId_idempotencyKey.idempotencyKey :
          payment.paymentId === where.paymentId) ?? null);
    db.payment.findUniqueOrThrow.mockImplementation(async ({ where }) => {
      const payment = payments.find((row) => row.paymentId === where.paymentId);
      if (!payment) throw new Error('Not found');
      return { ...payment };
    });
    db.payment.findFirst.mockImplementation(async ({ where }) =>
      [...payments].reverse().find((payment) =>
        !where.status || payment.status === where.status) ?? null);
    db.payment.create.mockImplementation(async ({ data }) => {
      const payment: Payment = {
        transactionReference: null, responseCode: null, transactionStatus: null,
        bankCode: null, payDate: null, refundRequired: false, createdAt: new Date(),
        ...data,
      };
      payments.push(payment);
      return { ...payment };
    });
    db.payment.update.mockImplementation(async ({ where, data }) => {
      const payment = payments.find((row) => row.paymentId === where.paymentId)!;
      Object.assign(payment, data);
      return { ...payment };
    });
    orders.expireOrderIfNeeded.mockResolvedValue(false);
    loyalty.earnPoints.mockResolvedValue(null);
    loyalty.reversePoints.mockResolvedValue(null);
    service = new VnpayPaymentsService(
      db as unknown as PrismaService, config, new VnpayService(config),
      orders as unknown as OrdersService, loyalty as unknown as LoyaltyService,
    );
  });

  function callback(payment = payments[0], overrides: Record<string, string> = {}) {
    const data = {
      vnp_TmnCode: 'TEST1234', vnp_TxnRef: payment.providerTxnRef!,
      vnp_Amount: '4500000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00',
      vnp_TransactionNo: '123456', vnp_PayDate: '20261114103000', vnp_BankCode: 'NCB',
      ...overrides,
    };
    return { ...data, vnp_SecureHash: signVnpayParameters(data, secret) };
  }

  it('creates INITIATED without marking the order PAID or awarding points', async () => {
    const result = await service.create(userId, dto, '127.0.0.1');
    expect(result.requiresRedirect).toBe(true);
    expect(result.payment.status).toBe(PaymentStatus.INITIATED);
    expect(result.paymentUrl).toContain('sandbox.vnpayment.vn');
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(loyalty.earnPoints).not.toHaveBeenCalled();
  });

  it('same-key concurrent requests reuse exactly one payment and URL', async () => {
    const results = await Promise.all([
      service.create(userId, dto, '127.0.0.1'), service.create(userId, dto, '127.0.0.1'),
    ]);
    expect(payments).toHaveLength(1);
    expect(results[0].paymentUrl).toBe(results[1].paymentUrl);
    expect(results[1].reused).toBe(true);
  });

  it('blocks a second key while the original payment is unknown', async () => {
    await service.create(userId, dto, '127.0.0.1');
    await expect(service.create(userId, { ...dto, idempotencyKey: 'attempt-2' }, '127.0.0.1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(payments).toHaveLength(1);
  });

  it('rejects another user, expired/cancelled orders and mock simulation', async () => {
    await expect(service.create('another-user', dto, '127.0.0.1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create(userId, { ...dto, simulateFailure: true }, '127.0.0.1'))
      .rejects.toBeInstanceOf(BadRequestException);
    order.createdAt = new Date(Date.now() - 901_000);
    await expect(service.create(userId, dto, '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
    order.status = OrderStatus.CANCELLED;
    await expect(service.create(userId, dto, '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
    expect(payments).toHaveLength(0);
  });

  it('does not extend the order deadline when retrying', async () => {
    order.createdAt = new Date(Date.now() - 800_000);
    const first = await service.create(userId, dto, '127.0.0.1');
    expect(first.payment.expiresAt!.getTime()).toBe(order.createdAt.getTime() + 900_000);
  });

  it('successful Return commits PAID and awards points once even with duplicate Returns', async () => {
    await service.create(userId, dto, '127.0.0.1');
    const query = callback();
    await Promise.all([service.confirmReturn(query), service.confirmReturn(query)]);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(payments[0].status).toBe(PaymentStatus.PAID);
    expect(loyalty.earnPoints).toHaveBeenCalledTimes(1);
    expect(loyalty.earnPoints).toHaveBeenCalledWith(userId, orderId, 45000);
  });

  it('failed Return permits a new attempt; replaying the old failure cannot overwrite it', async () => {
    await service.create(userId, dto, '127.0.0.1');
    const failure = callback(payments[0], { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' });
    await service.confirmReturn(failure);
    expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
    const retry = await service.create(userId, { ...dto, idempotencyKey: 'attempt-2' }, '127.0.0.1');
    expect(retry.payment.providerTxnRef).not.toBe(payments[0].providerTxnRef);
    await service.confirmReturn(failure);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(loyalty.earnPoints).not.toHaveBeenCalled();
    await service.confirmReturn(callback(payments[1]));
    expect(order.status).toBe(OrderStatus.PAID);
  });

  it('invalid signature, wrong amount and unknown reference cannot mutate DB', async () => {
    await service.create(userId, dto, '127.0.0.1');
    await expect(service.confirmReturn({ ...callback(), vnp_Amount: '100' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.confirmReturn(callback(payments[0], { vnp_Amount: '100' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.confirmReturn(callback(payments[0], { vnp_TxnRef: 'unknown123' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('late success after cancellation records refundRequired without restoring the order/points', async () => {
    await service.create(userId, dto, '127.0.0.1');
    order.status = OrderStatus.CANCELLED;
    await service.confirmReturn(callback());
    expect(payments[0].status).toBe(PaymentStatus.PAID);
    expect(payments[0].refundRequired).toBe(true);
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(loyalty.earnPoints).not.toHaveBeenCalled();
  });

  it('loyalty errors do not lose a confirmed payment', async () => {
    await service.create(userId, dto, '127.0.0.1');
    loyalty.earnPoints.mockRejectedValueOnce(new Error('loyalty unavailable'));
    await expect(service.confirmReturn(callback())).resolves.toEqual({
      orderId, paymentId: payments[0].paymentId,
    });
    expect(payments[0].status).toBe(PaymentStatus.PAID);
  });

  it('status is only readable by the owner and retains unknown payment state', async () => {
    await service.create(userId, dto, '127.0.0.1');
    await expect(service.getStatus('another-user', orderId)).rejects.toBeInstanceOf(NotFoundException);
    const result = await service.getStatus(userId, orderId);
    expect(result.payment?.status).toBe(PaymentStatus.INITIATED);
    expect(result.orderStatus).toBe(OrderStatus.PENDING);
  });
});
