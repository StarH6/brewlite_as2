
import {
  ExecutionContext,
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  OptionType,
  OrderStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersModule } from './orders.module';

type FakeProduct = {
  productId: string;
  name: string;
  description: string;
  basePrice: Prisma.Decimal;
  stock: number;
  version: number;
  status: string;
  options: any[];
};

const tick = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

class FakePrismaOrders {
  readonly products = new Map<string, FakeProduct>();
  readonly orders: any[] = [];
  productUpdates = 0;

  private barrier: {
    waiting: Array<() => void>;
    size: number;
  } | null = null;

  holdLookupsUntil(size: number): void {
    this.barrier = {
      waiting: [],
      size,
    };
  }

  product = {
    findMany: async ({
      where,
    }: {
      where: { productId: { in: string[] } };
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

      return (where.productId.in || [])
        .map((id) => this.products.get(id))
        .filter(Boolean)
        .map((product) => ({
          ...product!,
          basePrice: new Prisma.Decimal(product!.basePrice),
        }));
    },

    findUnique: async ({
      where,
    }: {
      where: { productId: string };
    }) => {
      await tick();

      const product = this.products.get(where.productId);

      return product
        ? {
            ...product,
            basePrice: new Prisma.Decimal(product.basePrice),
          }
        : null;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: {
        productId: string;
        version?: number;
        stock?: { gte?: number };
      };
      data: {
        stock?: { decrement?: number };
        version?: { increment?: number };
      };
    }) => {
      await tick();

      const product = this.products.get(where.productId);

      if (!product) {
        return { count: 0 };
      }

      if (
        where.version !== undefined &&
        product.version !== where.version
      ) {
        return { count: 0 };
      }

      if (
        where.stock?.gte !== undefined &&
        product.stock < where.stock.gte
      ) {
        return { count: 0 };
      }

      if (data.stock?.decrement !== undefined) {
        product.stock -= data.stock.decrement;
      }

      if (data.version?.increment !== undefined) {
        product.version += data.version.increment;
      }

      this.productUpdates += 1;

      return { count: 1 };
    },

    update: async ({
      where,
      data,
    }: {
      where: { productId: string };
      data: {
        stock?: { increment?: number };
        version?: { increment?: number };
      };
    }) => {
      await tick();

      const product = this.products.get(where.productId);

      if (!product) {
        throw new Error('Product not found');
      }

      if (data.stock?.increment !== undefined) {
        product.stock += data.stock.increment;
      }

      if (data.version?.increment !== undefined) {
        product.version += data.version.increment;
      }

      return {
        ...product,
        basePrice: new Prisma.Decimal(product.basePrice),
      };
    },
  };

  order = {
    create: async ({ data }: { data: any }) => {
      await tick();

      const newOrder = {
        orderId: randomUUID(),
        ...data,
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
        promotion: null,
      };

      this.orders.push(newOrder);

      return newOrder;
    },
  };

  promotion = {
    findUnique: async () => null,
  };

  productIngredient = {
    findMany: async () => [],
  };

  orderIngredientUsage = {
    createMany: async () => ({ count: 0 }),
    findMany: async () => [],
  };

  // Bổ sung mock còn thiếu cho snapshot Product.stock.
  orderProductStockUsage = {
    createMany: async ({ data }: { data: any[] }) => ({
      count: data.length,
    }),
    findMany: async () => [],
  };

  loyaltyTransaction = {
    findUnique: async () => null,
    create: async ({ data }: { data: any }) => ({
      transactionId: randomUUID(),
      ...data,
    }),
  };

  user = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  $transaction = async <T>(
    callback: (tx: FakePrismaOrders) => Promise<T>,
  ): Promise<T> => {
    return callback(this);
  };

  seedProduct(stock: number, version = 0): FakeProduct {
    const product: FakeProduct = {
      productId: randomUUID(),
      name: 'Cà phê Sữa Đá Test Concurrency',
      description: 'Món dùng để test bắn request đồng thời',
      basePrice: new Prisma.Decimal(29000),
      stock,
      version,
      status: 'ACTIVE',
      options: [
        {
          optionId: randomUUID(),
          name: 'Size M',
          type: OptionType.SIZE,
          priceAdjustment: new Prisma.Decimal(6000),
          isAvailable: true,
        },
      ],
    };

    this.products.set(product.productId, product);

    return product;
  }
}

describe(
  'POST /orders - Concurrency & Optimistic Locking (CV18, CONC-T01, NFR-05)',
  () => {
    let app: INestApplication;
    let db: FakePrismaOrders;

    beforeEach(async () => {
      db = new FakePrismaOrders();

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
          }),
          PrismaModule,
          OrdersModule,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();

            req.user = {
              userId:
                req.headers['x-user-id'] || 'user-customer-test',
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

    const placeOrder = (
      productId: string,
      quantity: number,
      userId = 'user-test',
    ) =>
      request(app.getHttpServer())
        .post('/orders')
        .set('x-user-id', userId)
        .send({
          items: [{ productId, quantity }],
        });

    it(
      'đặt đồng thời không vượt tồn kho: 10 request, stock = 3',
      async () => {
        const product = db.seedProduct(3, 0);

        db.holdLookupsUntil(10);

        const requests = Array.from({ length: 10 }, (_, index) =>
          placeOrder(
            product.productId,
            1,
            `user-${index}`,
          ),
        );

        const responses = await Promise.all(requests);

        const successResponses = responses.filter(
          (response) =>
            response.status === HttpStatus.CREATED,
        );

        const failureResponses = responses.filter(
          (response) =>
            response.status === HttpStatus.BAD_REQUEST ||
            response.status === HttpStatus.CONFLICT,
        );

        expect(successResponses).toHaveLength(3);

        for (const response of successResponses) {
          expect(response.body).toHaveProperty('orderCode');
          expect(response.body.status).toBe(
            OrderStatus.PENDING,
          );
        }

        expect(failureResponses).toHaveLength(7);

        for (const response of failureResponses) {
          expect(response.body.message).toMatch(
            /hết hàng|không đủ hàng|không đủ số lượng/i,
          );
        }

        const productInDb = db.products.get(
          product.productId,
        )!;

        expect(productInDb.stock).toBe(0);
        expect(productInDb.version).toBe(3);
        expect(db.orders).toHaveLength(3);
      },
    );

    it(
      'đặt đồng thời số lượng lớn hơn 1: stock = 5, 3 khách mỗi người đặt 2',
      async () => {
        const product = db.seedProduct(5, 0);

        db.holdLookupsUntil(3);

        const requests = [
          placeOrder(product.productId, 2, 'user-a'),
          placeOrder(product.productId, 2, 'user-b'),
          placeOrder(product.productId, 2, 'user-c'),
        ];

        const responses = await Promise.all(requests);

        const successResponses = responses.filter(
          (response) =>
            response.status === HttpStatus.CREATED,
        );

        const failureResponses = responses.filter(
          (response) =>
            response.status === HttpStatus.BAD_REQUEST ||
            response.status === HttpStatus.CONFLICT,
        );

        expect(successResponses).toHaveLength(2);
        expect(failureResponses).toHaveLength(1);

        expect(failureResponses[0].body.message).toMatch(
          /hết hàng|không đủ hàng|không đủ số lượng/i,
        );

        const productInDb = db.products.get(
          product.productId,
        )!;

        expect(productInDb.stock).toBe(1);
        expect(productInDb.version).toBe(2);
        expect(db.orders).toHaveLength(2);
      },
    );

    it(
      'từ chối ngay khi stock = 0 trước khi đặt hàng',
      async () => {
        const product = db.seedProduct(0, 0);

        const response = await placeOrder(
          product.productId,
          1,
        ).expect(HttpStatus.BAD_REQUEST);

        expect(response.body.message).toMatch(
          /không đủ hàng|hết hàng|không đủ số lượng/i,
        );

        expect(db.orders).toHaveLength(0);
      },
    );
  },
);
