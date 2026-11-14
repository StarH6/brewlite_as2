import {
  ExecutionContext,
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
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
type FakeIngredient = { ingredientId: string; name: string; unit: string; stock: number };
type FakeRecipe = { productId: string; ingredientId: string; quantityPerServing: number };
type FakeUsage = { orderId: string; ingredientId: string; quantity: number };

type FakeProductStockUsage = {
  orderId: string;
  productId: string;
  quantity: number;
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Prisma có thể truyền number, string hoặc Prisma.Decimal: luôn ép về number để tránh nối chuỗi. */
const num = (value: unknown): number => Number(value);

/**
 * DB giả trong bộ nhớ, mô phỏng 3 hành vi mà tính năng nguyên liệu dựa vào:
 *  - updateMany có điều kiện `stock >= cần` trả { count } (trừ nguyên tử, không âm);
 *  - $transaction hoàn tác (rollback) mọi thay đổi của chính giao dịch đó khi có lỗi;
 *  - barrier ép nhiều request cùng đọc công thức trước khi ai ghi (tình huống đua nhau).
 */
class FakePrismaIngredients {
  products = new Map<string, FakeProduct>();
  ingredients = new Map<string, FakeIngredient>();
  recipes: FakeRecipe[] = [];
  usages: FakeUsage[] = [];
  orders: any[] = [];
  productStockUsages: FakeProductStockUsage[] = [];
  private barrier: { waiting: Array<() => void>; size: number } | null = null;

  holdRecipeReadsUntil(size: number): void {
    this.barrier = { waiting: [], size };
  }

  /** Mỗi giao dịch có "sổ hoàn tác" riêng: lỗi thì chạy ngược lại các thay đổi của nó. */
  private client(undo: Array<() => void>) {
    const productRow = (id: string) => this.products.get(id)!;
    const ingredientRow = (id: string) => this.ingredients.get(id)!;

    return {
      product: {
        findMany: async ({ where }: { where: { productId: { in: string[] } } }) => {
          await tick();
          return (where.productId.in || [])
            .map((id) => this.products.get(id))
            .filter(Boolean)
            .map((p) => ({ ...p! }));
        },
        updateMany: async ({ where, data }: any) => {
          await tick();
          const p = this.products.get(where.productId);
          if (!p) return { count: 0 };
          if (where.version !== undefined && p.version !== where.version) return { count: 0 };
          if (where.stock?.gte !== undefined && p.stock < num(where.stock.gte)) {
            return { count: 0 };
          }
          const stockDelta = num(data.stock?.decrement ?? 0);
          const versionDelta = num(data.version?.increment ?? 0);
          p.stock -= stockDelta;
          p.version += versionDelta;
          undo.push(() => {
            productRow(where.productId).stock += stockDelta;
            productRow(where.productId).version -= versionDelta;
          });
          return { count: 1 };
        },
        findUnique: async ({ where }: { where: { productId: string } }) => {
          await tick();
          const p = this.products.get(where.productId);
          return p ? { ...p } : null;
        },
        update: async ({ where, data }: any) => {
          await tick();
          const p = productRow(where.productId);
          const stockDelta = num(data.stock?.increment ?? 0);
          const versionDelta = num(data.version?.increment ?? 0);
          p.stock += stockDelta;
          p.version += versionDelta;
          undo.push(() => {
            p.stock -= stockDelta;
            p.version -= versionDelta;
          });
          return { ...p };
        },
      },

      productIngredient: {
        findMany: async ({ where }: { where: { productId: { in: string[] } } }) => {
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
          return this.recipes
            .filter((r) => where.productId.in.includes(r.productId))
            .map((r) => ({ ...r, ingredient: { ...this.ingredients.get(r.ingredientId)! } }));
        },
      },

      ingredient: {
        updateMany: async ({ where, data }: any) => {
          await tick();
          const ing = this.ingredients.get(where.ingredientId);
          if (!ing) return { count: 0 };
          const dec = num(data.stock.decrement);
          if (where.stock?.gte !== undefined && ing.stock < num(where.stock.gte)) {
            return { count: 0 };
          }
          ing.stock -= dec;
          undo.push(() => {
            ingredientRow(where.ingredientId).stock += dec;
          });
          return { count: 1 };
        },
        findUnique: async ({ where }: { where: { ingredientId: string } }) => {
          await tick();
          const ing = this.ingredients.get(where.ingredientId);
          return ing ? { ...ing } : null;
        },
        update: async ({ where, data }: any) => {
          await tick();
          const ing = ingredientRow(where.ingredientId);
          const inc = num(data.stock.increment);
          ing.stock += inc;
          undo.push(() => {
            ing.stock -= inc;
          });
          return { ...ing };
        },
      },

      orderIngredientUsage: {
        createMany: async ({ data }: { data: any[] }) => {
          const rows = data.map((d) => ({ ...d, quantity: num(d.quantity) }));
          this.usages.push(...rows);
          undo.push(() => {
            this.usages = this.usages.filter((usage) => !rows.includes(usage));
          });
          return { count: rows.length };
        },
        findMany: async ({ where }: { where: { orderId: string } }) =>
          this.usages.filter((usage) => usage.orderId === where.orderId),
      },

      orderProductStockUsage: {
        createMany: async ({ data }: { data: any[] }) => {
          const rows = data.map((d) => ({ ...d, quantity: num(d.quantity) }));
          this.productStockUsages.push(...rows);
          undo.push(() => {
            this.productStockUsages = this.productStockUsages.filter(
              (usage) => !rows.includes(usage),
            );
          });
          return { count: rows.length };
        },
        findMany: async ({ where }: { where: { orderId: string } }) =>
          this.productStockUsages
            .filter((usage) => usage.orderId === where.orderId)
            .sort((a, b) => a.productId.localeCompare(b.productId)),
      },

      order: {
        create: async ({ data }: { data: any }) => {
          await tick();
          const row = {
            orderId: randomUUID(),
            ...data,
            items: (data.items?.create || []).map((it: any) => ({
              orderItemId: randomUUID(),
              ...it,
              options: [],
            })),
            promotion: null,
          };
          this.orders.push(row);
          undo.push(() => {
            this.orders = this.orders.filter((o) => o !== row);
          });
          return row;
        },

        findFirst: async ({ where }: { where: { orderId: string } }) => {
          await tick();
          const row = this.orders.find((o) => o.orderId === where.orderId);
          if (!row) return null;
          return {
            ...row,
            items: row.items,
            productStockUsages: this.productStockUsages.filter(
              (usage) => usage.orderId === where.orderId,
            ),
            ingredientUsages: this.usages.filter((usage) => usage.orderId === where.orderId),
          };
        },

        updateMany: async ({
          where,
          data,
        }: {
          where: { orderId: string; status: OrderStatus };
          data: { status: OrderStatus };
        }) => {
          await tick();
          const row = this.orders.find((o) => o.orderId === where.orderId);
          if (!row || row.status !== where.status) return { count: 0 };
          const previous = row.status;
          row.status = data.status;
          undo.push(() => {
            row.status = previous;
          });
          return { count: 1 };
        },

        findUniqueOrThrow: async ({ where }: { where: { orderId: string } }) => {
          const row = this.orders.find((o) => o.orderId === where.orderId)!;
          return {
            ...row,
            promotion: null,
            productStockUsages: this.productStockUsages.filter(
              (usage) => usage.orderId === where.orderId,
            ),
            ingredientUsages: this.usages.filter((usage) => usage.orderId === where.orderId),
          };
        },
      },

      promotion: { findUnique: async () => null },
    };
  }

  $transaction = async <T>(
    callback: (tx: ReturnType<FakePrismaIngredients['client']>) => Promise<T>,
    _options?: unknown,
  ) => {
    const undo: Array<() => void> = [];
    try {
      return await callback(this.client(undo));
    } catch (error) {
      for (const revert of undo.reverse()) revert();
      throw error;
    }
  };

  addProduct(name: string, stock = 100): FakeProduct {
    const product: FakeProduct = {
      productId: randomUUID(),
      name,
      description: '',
      basePrice: new Prisma.Decimal(40000),
      stock,
      version: 0,
      status: 'ACTIVE',
      options: [],
    };
    this.products.set(product.productId, product);
    return product;
  }

  addIngredient(name: string, unit: string, stock: number): FakeIngredient {
    const ingredient = { ingredientId: randomUUID(), name, unit, stock };
    this.ingredients.set(ingredient.ingredientId, ingredient);
    return ingredient;
  }

  addRecipe(product: FakeProduct, ingredient: FakeIngredient, quantityPerServing: number): void {
    this.recipes.push({
      productId: product.productId,
      ingredientId: ingredient.ingredientId,
      quantityPerServing,
    });
  }
}

describe('Nguyên liệu ràng buộc món: hết nguyên liệu thì không bán', () => {
  let app: INestApplication;
  let db: FakePrismaIngredients;

  beforeEach(async () => {
    db = new FakePrismaIngredients();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        OrdersModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: req.headers['x-user-id'] || 'user-test',
            email: 'customer@brewlite.vn',
            role: req.headers['x-role'] === 'STAFF' ? UserRole.STAFF : UserRole.CUSTOMER,
          };
          return true;
        },
      })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const order = (items: Array<{ productId: string; quantity: number }>, userId = 'user-test') =>
    request(app.getHttpServer()).post('/orders').set('x-user-id', userId).send({ items });

  const cancel = (orderId: string, userId = 'user-test', role: 'CUSTOMER' | 'STAFF' = 'CUSTOMER') =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('x-user-id', userId)
      .set('x-role', role);

  it('đặt đơn trừ nguyên liệu theo công thức nhân số lượng', async () => {
    const latte = db.addProduct('Matcha latte');
    const milk = db.addIngredient('Sữa tươi', 'ml', 1000);
    const matcha = db.addIngredient('Bột matcha', 'g', 100);
    db.addRecipe(latte, milk, 150);
    db.addRecipe(latte, matcha, 5);

    await order([{ productId: latte.productId, quantity: 2 }]).expect(HttpStatus.CREATED);

    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(700); // 1000 - 2*150
    expect(db.ingredients.get(matcha.ingredientId)!.stock).toBe(90); // 100 - 2*5
    // Món có công thức: tồn kho do nguyên liệu quản lý, không trừ Product.stock
    expect(db.products.get(latte.productId)!.stock).toBe(100);
  });

  it('một nguyên liệu không đủ thì từ chối cả đơn và không trừ gì (rollback)', async () => {
    const latte = db.addProduct('Matcha latte');
    const milk = db.addIngredient('Sữa tươi', 'ml', 1000);
    const matcha = db.addIngredient('Bột matcha', 'g', 4); // không đủ cho 1 ly (cần 5g)
    db.addRecipe(latte, milk, 150);
    db.addRecipe(latte, matcha, 5);

    const res = await order([{ productId: latte.productId, quantity: 1 }]).expect(
      HttpStatus.BAD_REQUEST,
    );

    expect(res.body.message).toContain('Bột matcha');
    expect(res.body.message).toMatch(/còn 4 g, cần 5 g/);
    // Sữa đã bị trừ trước khi phát hiện thiếu matcha, nhưng phải được hoàn tác.
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(1000);
    expect(db.ingredients.get(matcha.ingredientId)!.stock).toBe(4);
    expect(db.products.get(latte.productId)!.stock).toBe(100);
    expect(db.orders).toHaveLength(0);
    expect(db.usages).toHaveLength(0);
  });

  it('nguyên liệu hết hẳn (stock = 0) thì món không bán được', async () => {
    const latte = db.addProduct('Matcha latte');
    const matcha = db.addIngredient('Bột matcha', 'g', 0);
    db.addRecipe(latte, matcha, 5);

    const res = await order([{ productId: latte.productId, quantity: 1 }]).expect(
      HttpStatus.BAD_REQUEST,
    );

    expect(res.body.message).toContain('Bột matcha');
    expect(db.orders).toHaveLength(0);
  });

  it('món không có công thức thì không bị ràng buộc nguyên liệu', async () => {
    const water = db.addProduct('Nước suối');
    db.addIngredient('Sữa tươi', 'ml', 0); // nguyên liệu khác hết, không liên quan

    await order([{ productId: water.productId, quantity: 3 }]).expect(HttpStatus.CREATED);

    expect(db.products.get(water.productId)!.stock).toBe(97);
  });

  it('hai món dùng chung nguyên liệu: cộng dồn rồi mới kiểm tra', async () => {
    const latte = db.addProduct('Matcha latte');
    const cacao = db.addProduct('Cacao nóng');
    const milk = db.addIngredient('Sữa tươi', 'ml', 350);
    db.addRecipe(latte, milk, 150);
    db.addRecipe(cacao, milk, 150);

    // 1 + 1 = 300ml, đủ
    await order([
      { productId: latte.productId, quantity: 1 },
      { productId: cacao.productId, quantity: 1 },
    ]).expect(HttpStatus.CREATED);
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(50);

    // Mỗi món riêng lẻ cần 150ml (đủ nếu xét từng món) nhưng cộng lại 300ml > 50ml còn lại
    const res = await order([
      { productId: latte.productId, quantity: 1 },
      { productId: cacao.productId, quantity: 1 },
    ]).expect(HttpStatus.BAD_REQUEST);
    expect(res.body.message).toContain('Sữa tươi');
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(50);
  });

  it('đặt đồng thời: nguyên liệu chỉ đủ cho 2 ly thì đúng 2 đơn thành công, kho không âm', async () => {
    const latte = db.addProduct('Matcha latte');
    const milk = db.addIngredient('Sữa tươi', 'ml', 300); // đủ đúng 2 ly (150ml/ly)
    db.addRecipe(latte, milk, 150);

    db.holdRecipeReadsUntil(5); // cả 5 request cùng đọc công thức trước khi ai ghi

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        order([{ productId: latte.productId, quantity: 1 }], `user-${i}`),
      ),
    );

    const ok = responses.filter((r) => r.status === HttpStatus.CREATED);
    const rejected = responses.filter((r) => r.status === HttpStatus.BAD_REQUEST);

    expect(ok).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    for (const res of rejected) {
      expect(res.body.message).toContain('Sữa tươi');
    }
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(0); // không âm
    expect(db.orders).toHaveLength(2);
    // Món có công thức không trừ Product.stock; đơn bị từ chối cũng không làm đổi gì
    expect(db.products.get(latte.productId)!.stock).toBe(100);
  });

  it('hủy đơn hoàn đúng lượng nguyên liệu đã trừ, kể cả khi công thức bị sửa sau khi đặt', async () => {
    const latte = db.addProduct('Matcha latte');
    const milk = db.addIngredient('Sữa tươi', 'ml', 1000);
    db.addRecipe(latte, milk, 150);

    const created = await order([{ productId: latte.productId, quantity: 2 }]).expect(
      HttpStatus.CREATED,
    );
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(700);

    // Quán đổi công thức sau khi khách đã đặt (150ml -> 200ml)
    db.recipes[0].quantityPerServing = 200;

    await cancel(created.body.orderId).expect(HttpStatus.CREATED);

    // Hoàn 300ml (lượng đã trừ lúc đặt), không phải 400ml theo công thức mới
    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(1000);
    expect(db.products.get(latte.productId)!.stock).toBe(100);
  });

  it('hủy đơn hai lần chỉ hoàn nguyên liệu một lần', async () => {
    const latte = db.addProduct('Matcha latte');
    const milk = db.addIngredient('Sữa tươi', 'ml', 1000);
    db.addRecipe(latte, milk, 150);

    const created = await order([{ productId: latte.productId, quantity: 1 }]).expect(
      HttpStatus.CREATED,
    );

    await cancel(created.body.orderId).expect(HttpStatus.CREATED);
    // Nhân viên hủy lại đơn đã CANCELLED: state machine chặn (CANCELLED -> CANCELLED), không hoàn lần hai.
    await cancel(created.body.orderId, 'staff-1', 'STAFF').expect(HttpStatus.BAD_REQUEST);

    expect(db.ingredients.get(milk.ingredientId)!.stock).toBe(1000); // không bị cộng thừa
  });
});