
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsModule } from './payments.module';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

type OrderRow = {
  orderId: string;
  userId: string;
  status: string;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
};

type UserRow = {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
};

type PaymentRow = {
  paymentId: string;
  userId: string;
  orderId: string;
  idempotencyKey: string;
  amount: Prisma.Decimal;
  method: string;
  status: string;
  transactionReference: string;
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * DB giả trong bộ nhớ, mô phỏng:
 * - Unique (userId, orderId, idempotencyKey).
 * - updateMany có điều kiện.
 * - Transaction tuần tự.
 * - User lookup phục vụ JwtStrategy.
 */
class FakePrisma {
  readonly orders = new Map<string, OrderRow>();
  readonly users = new Map<string, UserRow>();
  readonly payments: PaymentRow[] = [];

  orderUpdates = 0;

  private lock: Promise<unknown> = Promise.resolve();
  private barrier: { waiting: Array<() => void>; size: number } | null = null;

  seedUser(): string {
    const userId = randomUUID();

    this.users.set(userId, {
      userId,
      email: `${userId}@test.local`,
      role: 'CUSTOMER',
      isActive: true,
    });

    return userId;
  }

  seedOrder(status: string, userId: string): OrderRow {
    const row: OrderRow = {
      orderId: randomUUID(),
      userId,
      status,
      totalAmount: new Prisma.Decimal(45000),
      createdAt: new Date(),
    };

    this.orders.set(row.orderId, row);

    return row;
  }

  holdPaymentLookupsUntil(size: number): void {
    this.barrier = { waiting: [], size };
  }

  order = {
    findFirst: async ({
      where,
    }: {
      where: { orderId: string; userId?: string };
    }) => {
      await tick();

      const row = this.orders.get(where.orderId);

      if (!row || (where.userId !== undefined && row.userId !== where.userId)) {
        return null;
      }

      return row;
    },

    findUnique: async ({
      where,
    }: {
      where: { orderId: string };
    }) => {
      await tick();

      return this.orders.get(where.orderId) ?? null;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { orderId: string; status: string };
      data: { status: string };
    }) => {
      const row = this.orders.get(where.orderId);

      if (!row || row.status !== where.status) {
        return { count: 0 };
      }

      row.status = data.status;
      this.orderUpdates += 1;

      return { count: 1 };
    },
  };

  payment = {
    findUnique: async ({
      where,
    }: {
      where: {
        userId_orderId_idempotencyKey: {
          userId: string;
          orderId: string;
          idempotencyKey: string;
        };
      };
    }) => {
      await tick();

      const barrier = this.barrier;

      if (barrier) {
        await new Promise<void>((resolve) => {
          barrier.waiting.push(resolve);

          if (barrier.waiting.length >= barrier.size) {
            this.barrier = null;
            barrier.waiting.forEach((release) => release());
          }
        });
      }

      const key = where.userId_orderId_idempotencyKey;

      return (
        this.payments.find(
          (payment) =>
            payment.userId === key.userId &&
            payment.orderId === key.orderId &&
            payment.idempotencyKey === key.idempotencyKey,
        ) ?? null
      );
    },

    create: async ({
      data,
    }: {
      data: Omit<PaymentRow, 'paymentId'>;
    }) => {
      const duplicated = this.payments.some(
        (payment) =>
          payment.userId === data.userId &&
          payment.orderId === data.orderId &&
          payment.idempotencyKey === data.idempotencyKey,
      );

      if (duplicated) {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: 'test',
          },
        );
      }

      const row: PaymentRow = {
        paymentId: randomUUID(),
        ...data,
      };

      this.payments.push(row);

      return row;
    },
  };

  loyaltyTransaction = {
    findUnique: async () => null,

    create: async ({ data }: { data: any }) => ({
      transactionId: randomUUID(),
      ...data,
    }),
  };

  user = {
    findUnique: async ({
      where,
    }: {
      where: { userId: string };
    }) => {
      return this.users.get(where.userId) ?? null;
    },

    update: async () => ({}),
  };

  $transaction = <T>(
    callback: (tx: FakePrisma) => Promise<T>,
  ): Promise<T> => {
    const run = this.lock.then(() => callback(this));

    this.lock = run.catch(() => undefined);

    return run;
  };
}

describe('POST /payments - Idempotency-Key (CV17, FR-06)', () => {
  let app: INestApplication;
  let db: FakePrisma;
  let jwt: JwtService;

  let defaultUserId: string;
  let defaultToken: string;

  beforeEach(async () => {
    db = new FakePrisma();
    defaultUserId = db.seedUser();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              JWT_EXPIRES_IN: '1h',
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
        PaymentsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();

    jwt = moduleRef.get(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    defaultToken = await jwt.signAsync({
      sub: defaultUserId,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Gửi request bằng token của user được chỉ định.
   * Trả về Supertest request để sử dụng .expect() và Promise.all().
   */
  const payAs = (
    orderId: string,
    token: string,
    headers: Record<string, string> = {},
    body: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .send({
        orderId,
        method: 'WALLET',
        ...body,
      });

  /**
   * Request mặc định bằng tài khoản test chính.
   */
  const pay = (
    orderId: string,
    headers: Record<string, string> = {},
    body: Record<string, unknown> = {},
  ) => payAs(orderId, defaultToken, headers, body);

  it('gửi 2 lần cùng Idempotency-Key chỉ tạo 1 thanh toán và trả lại kết quả cũ', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    const first = await pay(
      order.orderId,
      { 'Idempotency-Key': 'key-abc' },
    ).expect(201);

    const second = await pay(
      order.orderId,
      { 'Idempotency-Key': 'key-abc' },
    ).expect(201);

    expect(first.body.reused).toBe(false);
    expect(first.body.orderStatus).toBe('PAID');

    expect(second.body.reused).toBe(true);
    expect(second.body.payment.paymentId).toBe(
      first.body.payment.paymentId,
    );
    expect(second.body.orderStatus).toBe('PAID');

    expect(db.payments).toHaveLength(1);
    expect(db.orderUpdates).toBe(1);
  });

  it('gửi song song 2 request cùng key vẫn chỉ tạo 1 thanh toán', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    db.holdPaymentLookupsUntil(2);

    const [a, b] = await Promise.all([
      pay(order.orderId, { 'Idempotency-Key': 'double-click' }),
      pay(order.orderId, { 'Idempotency-Key': 'double-click' }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);

    expect(a.body.payment.paymentId).toBe(
      b.body.payment.paymentId,
    );

    expect([a.body.reused, b.body.reused].sort()).toEqual([
      false,
      true,
    ]);

    expect(db.payments).toHaveLength(1);
    expect(db.orderUpdates).toBe(1);
  });

  it('khác key trên đơn đã PAID thì bị từ chối 409', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    await pay(
      order.orderId,
      { 'Idempotency-Key': 'key-1' },
    ).expect(201);

    const res = await pay(
      order.orderId,
      { 'Idempotency-Key': 'key-2' },
    ).expect(409);

    expect(res.body.statusCode).toBe(409);
    expect(db.payments).toHaveLength(1);
  });

  it('thanh toán lỗi rồi thử lại bằng key mới là hai lần thanh toán khác nhau', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    const failed = await pay(
      order.orderId,
      { 'Idempotency-Key': 'try-1' },
      { simulateFailure: true },
    ).expect(201);

    const retried = await pay(
      order.orderId,
      { 'Idempotency-Key': 'try-2' },
    ).expect(201);

    expect(failed.body.orderStatus).toBe('PAYMENT_FAILED');
    expect(retried.body.orderStatus).toBe('PAID');

    expect(retried.body.payment.paymentId).not.toBe(
      failed.body.payment.paymentId,
    );

    expect(db.payments).toHaveLength(2);
  });

  it('gửi lại key của lần thất bại thì trả kết quả thất bại cũ', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    const first = await pay(
      order.orderId,
      { 'Idempotency-Key': 'try-1' },
      { simulateFailure: true },
    ).expect(201);

    const replay = await pay(
      order.orderId,
      { 'Idempotency-Key': 'try-1' },
    ).expect(201);

    expect(replay.body.reused).toBe(true);

    expect(replay.body.payment.paymentId).toBe(
      first.body.payment.paymentId,
    );

    expect(replay.body.payment.status).toBe('FAILED');
    expect(db.payments).toHaveLength(1);
  });

  it('cùng key nhưng khác đơn là hai thanh toán độc lập', async () => {
    const a = db.seedOrder('PENDING', defaultUserId);
    const b = db.seedOrder('PENDING', defaultUserId);

    await pay(
      a.orderId,
      { 'Idempotency-Key': 'shared' },
    ).expect(201);

    const res = await pay(
      b.orderId,
      { 'Idempotency-Key': 'shared' },
    ).expect(201);

    expect(res.body.reused).toBe(false);
    expect(db.payments).toHaveLength(2);
  });

  it('thiếu Idempotency-Key thì 400 và không tạo thanh toán', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    const res = await pay(order.orderId).expect(400);

    expect(res.body.message).toContain('Idempotency-Key');
    expect(db.payments).toHaveLength(0);
    expect(order.status).toBe('PENDING');
  });

  it('Idempotency-Key dài hơn 64 ký tự thì 400', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    await pay(
      order.orderId,
      { 'Idempotency-Key': 'x'.repeat(65) },
    ).expect(400);

    expect(db.payments).toHaveLength(0);
  });

  it('header và body gửi khóa khác nhau thì 400; body đứng một mình vẫn được', async () => {
    const order = db.seedOrder('PENDING', defaultUserId);

    await pay(
      order.orderId,
      { 'Idempotency-Key': 'a' },
      { idempotencyKey: 'b' },
    ).expect(400);

    expect(db.payments).toHaveLength(0);

    const legacy = await pay(
      order.orderId,
      {},
      { idempotencyKey: 'legacy' },
    ).expect(201);

    expect(legacy.body.reused).toBe(false);
  });

  it('đơn không tồn tại thì 404', async () => {
    await pay(
      randomUUID(),
      { 'Idempotency-Key': 'k' },
    ).expect(404);
  });

  it('user không thể thanh toán đơn hàng thuộc về user khác', async () => {
    const ownerId = db.seedUser();
    const anotherUserId = db.seedUser();

    const anotherToken = await jwt.signAsync({
      sub: anotherUserId,
    });

    const order = db.seedOrder('PENDING', ownerId);

    const res = await payAs(
      order.orderId,
      anotherToken,
      { 'Idempotency-Key': 'unauthorized-payment' },
    ).expect(404);

    expect(res.body.statusCode).toBe(404);
    expect(db.payments).toHaveLength(0);
    expect(order.status).toBe('PENDING');
    expect(db.orderUpdates).toBe(0);
  });
});
