
import {
  ExecutionContext,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  Prisma,
  PromotionStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsModule } from './promotions.module';

class FakePrismaCV21 {
  readonly users = new Map<string, any>();
  readonly products = new Map<string, any>();
  readonly promotions = new Map<string, any>();
  readonly orders = new Map<string, any>();
  readonly payments: any[] = [];
  readonly loyaltyTransactions: any[] = [];

  user = {
    findUnique: async ({
      where,
    }: {
      where: { userId: string };
    }) => {
      return this.users.get(where.userId) ?? null;
    },

    update: async ({
      where,
      data,
    }: {
      where: { userId: string };
      data: any;
    }) => {
      const user = this.users.get(where.userId);

      if (!user) return null;

      if (data.loyaltyPoints?.increment !== undefined) {
        user.loyaltyPoints =
          (user.loyaltyPoints || 0) +
          data.loyaltyPoints.increment;
      } else if (typeof data.loyaltyPoints === 'number') {
        user.loyaltyPoints = data.loyaltyPoints;
      }

      return user;
    },
  };

  // Các món trong test này không có công thức nguyên liệu.
  productIngredient = {
    findMany: async () => [],
  };

  orderIngredientUsage = {
    createMany: async () => ({ count: 0 }),
    findMany: async () => [],
  };

  // Mock snapshot tồn kho Product.stock.
  orderProductStockUsage = {
    createMany: async ({ data }: { data: any[] }) => ({
      count: data.length,
    }),
    findMany: async () => [],
  };

  product = {
    findMany: async ({
      where,
    }: {
      where: { productId: { in: string[] } };
    }) => {
      return (where.productId.in || [])
        .map((id) => this.products.get(id))
        .filter(Boolean)
        .map((product) => ({
          ...product,
          basePrice: new Prisma.Decimal(product.basePrice),
        }));
    },

    updateMany: async () => ({ count: 1 }),
  };

  promotion = {
    findUnique: async ({
      where,
    }: {
      where: { code: string };
    }) => {
      const promotion = this.promotions.get(
        where.code.toUpperCase(),
      );

      if (!promotion) return null;

      return {
        ...promotion,
        discountValue: new Prisma.Decimal(
          promotion.discountValue,
        ),
        maxDiscount:
          promotion.maxDiscount !== null
            ? new Prisma.Decimal(promotion.maxDiscount)
            : null,
        minimumOrderAmount: new Prisma.Decimal(
          promotion.minimumOrderAmount,
        ),
      };
    },
  };

  order = {
    create: async ({ data }: { data: any }) => {
      const orderId = randomUUID();

      const row = {
        orderId,
        orderCode: data.orderCode,
        userId: data.userId,
        promotionId: data.promotionId ?? null,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        totalAmount: data.totalAmount,
        status: data.status,
        createdAt: new Date(),

        items: (data.items?.create || []).map((item: any) => ({
          orderItemId: randomUUID(),
          ...item,
          options: (item.options?.create || []).map(
            (option: any) => ({
              orderItemOptionId: randomUUID(),
              ...option,
            }),
          ),
        })),

        promotion: data.promotionId
          ? this.promotions.get(data.promotionId)
          : null,
      };

      this.orders.set(orderId, row);

      return row;
    },

    findUnique: async ({
      where,
    }: {
      where: { orderId: string };
    }) => {
      return this.orders.get(where.orderId) ?? null;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { orderId: string };
      data: any;
    }) => {
      const order = this.orders.get(where.orderId);

      if (!order) return { count: 0 };

      order.status = data.status;

      return { count: 1 };
    },

    findFirst: async ({
      where,
    }: {
      where: { orderId: string; userId?: string };
    }) => {
      const order = this.orders.get(where.orderId);

      if (!order || (where.userId !== undefined && order.userId !== where.userId)) {
        return null;
      }

      return order;
    },
  };

  payment = {
    findUnique: async ({ where }: { where: any }) => {
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

    create: async ({ data }: { data: any }) => {
      const payment = {
        paymentId: randomUUID(),
        ...data,
      };

      this.payments.push(payment);

      return payment;
    },
  };

  loyaltyTransaction = {
    findUnique: async ({
      where,
    }: {
      where: {
        orderId_type: {
          orderId: string;
          type: string;
        };
      };
    }) => {
      const { orderId, type } = where.orderId_type;

      return (
        this.loyaltyTransactions.find(
          (transaction) =>
            transaction.orderId === orderId &&
            transaction.type === type,
        ) ?? null
      );
    },

    create: async ({ data }: { data: any }) => {
      const transaction = {
        transactionId: randomUUID(),
        ...data,
      };

      this.loyaltyTransactions.push(transaction);

      return transaction;
    },
  };

  $transaction = async <T>(
    callback: (tx: FakePrismaCV21) => Promise<T>,
  ): Promise<T> => {
    return callback(this);
  };
}

describe('CV21 - Task 10: Khuyến mãi & Điểm thưởng E2E', () => {
  let app: INestApplication;
  let db: FakePrismaCV21;

  const testUserId = '11111111-1111-4111-8111-111111111111';
  const testProductId = '22222222-2222-4222-8222-222222222222';
  const promo10kId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    db = new FakePrismaCV21();

    db.users.set(testUserId, {
      userId: testUserId,
      email: 'customer@brewlite.vn',
      username: 'customer',
      loyaltyPoints: 0,
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    db.products.set(testProductId, {
      productId: testProductId,
      name: 'Trà Sữa Oolong',
      description: 'Đậm vị trà',
      basePrice: 45000,
      stock: 100,
      version: 0,
      status: 'ACTIVE',
      options: [],
    });

    db.promotions.set('GIAM10K', {
      promotionId: promo10kId,
      code: 'GIAM10K',
      discountType: DiscountType.FIXED,
      discountValue: 10000,
      maxDiscount: null,
      minimumOrderAmount: 30000,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
      status: PromotionStatus.ACTIVE,
    });

    db.promotions.set('HETHAN', {
      promotionId: '44444444-4444-4444-8444-444444444444',
      code: 'HETHAN',
      discountType: DiscountType.FIXED,
      discountValue: 10000,
      maxDiscount: null,
      minimumOrderAmount: 20000,
      startAt: new Date(Date.now() - 7200000),
      endAt: new Date(Date.now() - 3600000),
      status: PromotionStatus.ACTIVE,
    });

    db.promotions.set('MIN100K', {
      promotionId: '55555555-5555-4555-8555-555555555555',
      code: 'MIN100K',
      discountType: DiscountType.FIXED,
      discountValue: 20000,
      maxDiscount: null,
      minimumOrderAmount: 100000,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
      status: PromotionStatus.ACTIVE,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
        PrismaModule,
        PromotionsModule,
        LoyaltyModule,
        OrdersModule,
        PaymentsModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();

          req.user = {
            userId: testUserId,
            email: 'customer@brewlite.vn',
            role: UserRole.CUSTOMER,
          };

          return true;
        },
      })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Tiêu chí nghiệm thu 1: Mã sai bị từ chối', () => {
    it('từ chối khi mã khuyến mãi không tồn tại', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          promoCode: 'MA_KHONG_TON_TAI',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('không tồn tại');
    });

    it('từ chối khi mã khuyến mãi đã hết hạn', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          promoCode: 'HETHAN',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('đã hết hạn');
    });

    it('từ chối khi đơn hàng không đạt giá trị tối thiểu', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          promoCode: 'MIN100K',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'chưa đạt giá trị tối thiểu',
      );
    });

    it('áp dụng mã khuyến mãi hợp lệ thành công và tính đúng số tiền', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          promoCode: 'GIAM10K',
        });

      expect(response.status).toBe(201);
      expect(response.body.subtotal).toBe(45000);
      expect(response.body.discountAmount).toBe(10000);
      expect(response.body.totalAmount).toBe(35000);
      expect(response.body.promotionId).toBe(promo10kId);
    });
  });

  describe('Tiêu chí nghiệm thu 2: Điểm cộng đúng sau PAID', () => {
    it('cộng điểm loyalty chuẩn xác cho user sau khi đơn chuyển sang PAID', async () => {
      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          promoCode: 'GIAM10K',
        });

      expect(orderResponse.status).toBe(201);
      expect(orderResponse.body.totalAmount).toBe(35000);

      const orderId = orderResponse.body.orderId;

      expect(db.users.get(testUserId).loyaltyPoints).toBe(0);

      const idempotencyKey = randomUUID();

      const paymentResponse = await request(app.getHttpServer())
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId,
          method: PaymentMethod.WALLET,
        });

      expect(paymentResponse.status).toBe(201);
      expect(paymentResponse.body.orderStatus).toBe(
        OrderStatus.PAID,
      );

      const user = db.users.get(testUserId);

      expect(user.loyaltyPoints).toBe(3);

      const transaction = db.loyaltyTransactions.find(
        (item) => item.orderId === orderId,
      );

      expect(transaction).toBeDefined();
      expect(transaction.points).toBe(3);
      expect(transaction.type).toBe('EARN');

      const retryResponse = await request(app.getHttpServer())
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId,
          method: PaymentMethod.WALLET,
        });

      expect(retryResponse.status).toBe(201);
      expect(retryResponse.body.reused).toBe(true);
      expect(db.users.get(testUserId).loyaltyPoints).toBe(3);
    });

    it('không cộng điểm loyalty khi thanh toán thất bại', async () => {
      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
        });

      expect(orderResponse.status).toBe(201);

      const orderId = orderResponse.body.orderId;

      const paymentResponse = await request(app.getHttpServer())
        .post('/payments')
        .set('Idempotency-Key', randomUUID())
        .send({
          orderId,
          method: PaymentMethod.CARD,
          simulateFailure: true,
        });

      expect(paymentResponse.status).toBe(201);
      expect(paymentResponse.body.orderStatus).toBe(
        OrderStatus.PAYMENT_FAILED,
      );

      expect(db.users.get(testUserId).loyaltyPoints).toBe(0);

      expect(
        db.loyaltyTransactions.filter(
          (transaction) => transaction.orderId === orderId,
        ),
      ).toHaveLength(0);
    });
  });
});
