import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CancelReason,
  OptionType,
  OrderStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  aggregateRequirements,
  type IngredientRequirement,
  type OptionEffectLine,
  type OrderIngredientSelection,
  type RecipeLine,
  type InventoryReservation,
} from '../ingredients/domain/ingredient-policy';

import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { OrderStateMachine } from './domain/order-state-machine';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  /** Thời gian mặc định chờ thanh toán: 15 phút (tính theo Order.createdAt). */
  private static readonly DEFAULT_PAYMENT_TIMEOUT_SECONDS = 900;

  constructor(
    private readonly prisma: PrismaService,
    private readonly promotionsService: PromotionsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly config: ConfigService,
  ) {}

  /** Đọc timeout thanh toán (giây) từ config; sai/thiếu thì dùng mặc định. */
  private getPaymentTimeoutMs(): number {
    const configured = Number(
      this.config.get<string | number>(
        'ORDER_PAYMENT_TIMEOUT_SECONDS',
        OrdersService.DEFAULT_PAYMENT_TIMEOUT_SECONDS,
      ),
    );
    const seconds =
      Number.isFinite(configured) && configured > 0
        ? configured
        : OrdersService.DEFAULT_PAYMENT_TIMEOUT_SECONDS;
    return seconds * 1000;
  }

  /** Deadline thanh toán của một đơn, luôn tính từ createdAt (không reset khi thử lại). */
  private getPaymentDeadline(createdAt: Date): Date {
    return new Date(createdAt.getTime() + this.getPaymentTimeoutMs());
  }

  private isAwaitingPayment(status: OrderStatus): boolean {
    return (
      status === OrderStatus.PENDING || status === OrderStatus.PAYMENT_FAILED
    );
  }

  private isPaymentExpired(
    order: { status: OrderStatus; createdAt?: Date | null },
    now: Date = new Date(),
  ): boolean {
    if (!order.createdAt || !this.isAwaitingPayment(order.status)) {
      return false;
    }
    return (
      this.getPaymentDeadline(new Date(order.createdAt)).getTime() <=
      now.getTime()
    );
  }

  // Chuyển Order từ Prisma sang response chuẩn cho client.
  public mapOrderResponse(order: any) {
    return {
      id: order.orderId,
      orderId: order.orderId,
      orderCode: order.orderCode,
      userId: order.userId,
      promotionId: order.promotionId,

      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),

      status: order.status,
      createdAt: order.createdAt,
      paymentDeadline: order.createdAt
        ? this.getPaymentDeadline(new Date(order.createdAt))
        : null,
      cancelReason: order.cancelReason ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancelledBy: order.cancelledBy ?? null,
      items: (order.items ?? []).map((item: any) => ({
        id: item.orderItemId,
        orderItemId: item.orderItemId,
        orderId: item.orderId,
        productId: item.productId,
        imageUrl: item.product?.imageUrl ?? null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),

        options: (item.options ?? []).map((option: any) => ({
          id: option.orderItemOptionId,
          orderItemOptionId: option.orderItemOptionId,
          optionName: option.optionName,
          optionType: option.optionType,
          priceAdjustment: Number(option.priceAdjustment),
        })),
      })),

      promotion: order.promotion,
    };
  }

  // Tạo đơn hàng.
  async createOrder(userId: string, dto: CreateOrderDto) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeCreateOrder(userId, dto);
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';

        const shouldRetry =
          error instanceof ConflictException ||
          isSerializationConflict;

        if (!shouldRetry || attempt === maxRetries) {
          if (isSerializationConflict) {
            throw new ConflictException(
              'Hệ thống đang xử lý nhiều đơn hàng đồng thời. Vui lòng thử lại.',
            );
          }

          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 30),
        );
      }
    }

    throw new ConflictException(
      'Không thể hoàn tất đơn hàng.',
    );
  }

  // Thực hiện tạo đơn hàng trong Transaction Serializable.
  private async executeCreateOrder(userId: string, dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'Giỏ hàng không được để trống.',
      );
    }

    // Kiểm tra số lượng và productId đầu vào.
    for (const item of dto.items) {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new BadRequestException(
          'Thông tin sản phẩm hoặc số lượng không hợp lệ.',
        );
      }

      if (
        item.toppingOptionIds && new Set(item.toppingOptionIds).size !== item.toppingOptionIds.length
      ) {
        throw new BadRequestException(
          'Không được chọn trùng Topping.',
        );
      }
    }

    const uniqueProductIds = [
      ...new Set(dto.items.map((item) => item.productId)),
    ].sort();

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Lấy sản phẩm và các tùy chọn.
        const products = await tx.product.findMany({
          where: {
            productId: {
              in: uniqueProductIds,
            },
          },
          include: {
            options: true,
          },
        });

        if (products.length !== uniqueProductIds.length) {
          throw new BadRequestException(
            'Một hoặc nhiều sản phẩm không tồn tại.',
          );
        }

        const productMap = new Map(
          products.map((product) => [
            product.productId,
            product,
          ]),
        );

        // 2. Kiểm tra trạng thái sản phẩm.
        for (const product of products) {
          if (product.status !== 'ACTIVE') {
            throw new BadRequestException(
              `Sản phẩm "${product.name}" hiện không còn mở bán.`,
            );
          }
        }

        // 3. Tính giá từ database.
        let subtotal = 0;

        const orderItemsToCreate: Array<{
          productId: string;
          productName: string;
          quantity: number;
          unitPrice: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          options: Array<{
            optionName: string;
            optionType: OptionType;
            priceAdjustment: Prisma.Decimal;
          }>;
        }> = [];

        for (const item of dto.items) {
          const product = productMap.get(item.productId)!;

          let unitPrice = Number(product.basePrice);

          const optionsToCreate: Array<{
            optionName: string;
            optionType: OptionType;
            priceAdjustment: Prisma.Decimal;
          }> = [];

          // Size.
          if (item.sizeOptionId) {
            const sizeOption = product.options.find(
              (option) =>
                option.optionId === item.sizeOptionId &&
                option.type === OptionType.SIZE,
            );

            if (!sizeOption || !sizeOption.isAvailable) {
              throw new BadRequestException(
                `Tùy chọn Size không hợp lệ cho sản phẩm "${product.name}".`,
              );
            }

            const adjustment = Number(
              sizeOption.priceAdjustment,
            );

            unitPrice += adjustment;

            optionsToCreate.push({
              optionName: sizeOption.name,
              optionType: OptionType.SIZE,
              priceAdjustment: new Prisma.Decimal(
                adjustment,
              ),
            });
          }

          // Topping.
          for (const toppingId of item.toppingOptionIds ?? []) {
            const toppingOption = product.options.find(
              (option) =>
                option.optionId === toppingId &&
                option.type === OptionType.TOPPING,
            );

            if (
              !toppingOption ||
              !toppingOption.isAvailable
            ) {
              throw new BadRequestException(
                `Tùy chọn Topping không hợp lệ cho sản phẩm "${product.name}".`,
              );
            }

            const adjustment = Number(
              toppingOption.priceAdjustment,
            );

            unitPrice += adjustment;

            optionsToCreate.push({
              optionName: toppingOption.name,
              optionType: OptionType.TOPPING,
              priceAdjustment: new Prisma.Decimal(
                adjustment,
              ),
            });
          }

          if (unitPrice < 0) {
            throw new BadRequestException(
              `Giá sản phẩm "${product.name}" không hợp lệ.`,
            );
          }

          const itemSubtotal = unitPrice * item.quantity;

          subtotal += itemSubtotal;

          orderItemsToCreate.push({
            productId: product.productId,
            productName: product.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(unitPrice),
            subtotal: new Prisma.Decimal(itemSubtotal),
            options: optionsToCreate,
          });
        }

        // 4. Áp dụng khuyến mãi.
        let discountAmount = 0;
        let promotionId: string | undefined;

        if (dto.promoCode) {
          const promoResult =
            await this.promotionsService.applyPromotion(
              dto.promoCode,
              subtotal,
              tx,
            );

          discountAmount = promoResult.discountAmount;
          promotionId = promoResult.promotionId;
        }

        const totalAmount = Math.max(
          0,
          subtotal - discountAmount,
        );

        const orderCode =
          `BL-${Date.now().toString(36).toUpperCase()}-` +
          `${Math.floor(1000 + Math.random() * 9000)}`;

        // 5. Trừ tồn kho theo mô hình Hybrid Inventory.
        //
        // Có công thức:
        //   Ingredient.stock
        //
        // Không có công thức:
        //   Product.stock
        //
        // Giữ từng dòng riêng để tính đúng Size/Topping.
        const inventory = await this.reserveInventory(
          tx,
          dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeOptionId: item.sizeOptionId,
            toppingOptionIds:
              item.toppingOptionIds ?? [],
          })),
          products.map((product) => ({
            productId: product.productId,
            name: product.name,
            stock: product.stock,
            version: product.version,
          })),
        );

        // 6. Tạo Order và OrderItems.
        const order = await tx.order.create({
          data: {
            orderCode,
            userId,
            promotionId,

            subtotal: new Prisma.Decimal(subtotal),
            discountAmount: new Prisma.Decimal(
              discountAmount,
            ),
            totalAmount: new Prisma.Decimal(totalAmount),

            status: OrderStatus.PENDING,

            items: {
              create: orderItemsToCreate.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,

                options: {
                  create: item.options,
                },
              })),
            },
          },
          include: {
            items: {
              include: {
                options: true,
                product: {
                  select: {
                    imageUrl: true,
                  },
                },
              },
            },
            promotion: true,
          },
        });

        // 7. Lưu snapshot nguyên liệu đã tiêu thụ.
        if (inventory.ingredientRequirements.length > 0) {
          await tx.orderIngredientUsage.createMany({
            data: inventory.ingredientRequirements.map(
              (requirement) => ({
                orderId: order.orderId,
                ingredientId: requirement.ingredientId,
                quantity: new Prisma.Decimal(
                  requirement.need.toFixed(3),
                ),
              }),
            ),
          });
        }

        // 8. Lưu snapshot Product.stock đã tiêu thụ.
        if (inventory.productStockUsages.length > 0) {
          await tx.orderProductStockUsage.createMany({
            data: inventory.productStockUsages.map(
              (usage) => ({
                orderId: order.orderId,
                productId: usage.productId,
                quantity: usage.quantity,
              }),
            ),
          });
        }

        return this.mapOrderResponse(order);
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  // Trừ tồn kho.
  private async reserveInventory(
    tx: Prisma.TransactionClient,
    items: OrderIngredientSelection[],
    products: ReadonlyArray<{
      productId: string;
      name: string;
      stock: number;
      version: number;
    }>,
  ): Promise<InventoryReservation> {
    const productIds = [
      ...new Set(items.map((item) => item.productId)),
    ].sort();

    const productMap = new Map(
      products.map((product) => [
        product.productId,
        product,
      ]),
    );

    // 1. Lấy công thức nguyên liệu.
    const recipeRows = await tx.productIngredient.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
      include: {
        ingredient: true,
      },
      orderBy: [
        { ingredientId: 'asc' },
        { productId: 'asc' },
      ],
    });

    const recipes = new Map<string, RecipeLine[]>();

    for (const row of recipeRows) {
      const lines = recipes.get(row.productId) ?? [];

      lines.push({
        ingredientId: row.ingredientId,
        name: row.ingredient.name,
        unit: row.ingredient.unit,
        quantityPerServing: Number(
          row.quantityPerServing,
        ),
        stock: Number(row.ingredient.stock),
      });

      recipes.set(row.productId, lines);
    }

    // Có ít nhất một ProductIngredient => quản lý bằng nguyên liệu.
    const recipeProductIds = new Set(recipes.keys());

    const trackedItems = items.filter((item) =>
      recipeProductIds.has(item.productId),
    );

    const untrackedItems = items.filter(
      (item) => !recipeProductIds.has(item.productId),
    );

    // 2. Gom số lượng sản phẩm không có công thức.
    const productQuantities = new Map<string, number>();

    for (const item of untrackedItems) {
      productQuantities.set(
        item.productId,
        (productQuantities.get(item.productId) ?? 0) +
          item.quantity,
      );
    }

    const productStockUsages:
      InventoryReservation['productStockUsages'] = [];

    // 3. Trừ Product.stock bằng Optimistic Locking.
    for (const [productId, quantity] of [
      ...productQuantities.entries(),
    ].sort(([a], [b]) => a.localeCompare(b))) {
      const product = productMap.get(productId);

      if (!product) {
        throw new NotFoundException(
          'Không tìm thấy sản phẩm.',
        );
      }

      const updated = await tx.product.updateMany({
        where: {
          productId,
          version: product.version,
          stock: {
            gte: quantity,
          },
        },
        data: {
          stock: {
            decrement: quantity,
          },
          version: {
            increment: 1,
          },
        },
      });

      if (updated.count === 0) {
        const current = await tx.product.findUnique({
          where: {
            productId,
          },
          select: {
            stock: true,
            name: true,
          },
        });

        if (!current || current.stock < quantity) {
          throw new BadRequestException(
            `Sản phẩm "${product.name}" không đủ hàng ` +
              `(còn ${current?.stock ?? 0}, cần ${quantity}).`,
          );
        }

        throw new ConflictException(
          `Tồn kho "${product.name}" vừa thay đổi. Vui lòng thử lại.`,
        );
      }

      productStockUsages.push({
        productId,
        quantity,
      });
    }

    // Không có sản phẩm quản lý bằng nguyên liệu.
    if (trackedItems.length === 0) {
      return {
        ingredientRequirements: [],
        productStockUsages,
      };
    }

    // 4. Lấy các option được chọn.
    const selectedOptionIds = [
      ...new Set(
        trackedItems.flatMap((item) => [
          ...(item.sizeOptionId
            ? [item.sizeOptionId]
            : []),
          ...(item.toppingOptionIds ?? []),
        ]),
      ),
    ].sort();

    const effectRows = selectedOptionIds.length
      ? await tx.productOptionIngredient.findMany({
          where: {
            optionId: {
              in: selectedOptionIds,
            },
          },
          include: {
            ingredient: true,
            option: {
              select: {
                productId: true,
                type: true,
              },
            },
          },
          orderBy: [
            { ingredientId: 'asc' },
            { optionId: 'asc' },
          ],
        })
      : [];

    // 5. Chuyển Decimal sang number cho policy.
    const effects = new Map<string, OptionEffectLine[]>();

    for (const row of effectRows) {
      const lines = effects.get(row.optionId) ?? [];

      lines.push({
        optionId: row.optionId,
        productId: row.option.productId,
        type: row.option.type,
        ingredientId: row.ingredientId,
        name: row.ingredient.name,
        unit: row.ingredient.unit,
        quantityDelta: Number(row.quantityDelta),
      });

      effects.set(row.optionId, lines);
    }

    // 6. Tính tổng nguyên liệu theo từng dòng đơn hàng.
    let requirements: IngredientRequirement[];

    try {
      requirements = aggregateRequirements(
        trackedItems,
        recipes,
        effects,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }

    // 7. Trừ Ingredient.stock theo thứ tự ingredientId.
    for (const requirement of requirements) {
      const need = new Prisma.Decimal(
        requirement.need.toFixed(3),
      );

      const updated = await tx.ingredient.updateMany({
        where: {
          ingredientId: requirement.ingredientId,
          stock: {
            gte: need,
          },
        },
        data: {
          stock: {
            decrement: need,
          },
        },
      });

      if (updated.count === 0) {
        const current = await tx.ingredient.findUnique({
          where: {
            ingredientId: requirement.ingredientId,
          },
          select: {
            stock: true,
          },
        });

        throw new BadRequestException(
          `Không đủ nguyên liệu "${requirement.name}" ` +
            `(còn ${current?.stock.toString() ?? 0} ${requirement.unit}, ` +
            `cần ${requirement.need} ${requirement.unit}).`,
        );
      }
    }

    return {
      ingredientRequirements: requirements,
      productStockUsages,
    };
  }

  // Hoàn nguyên liệu.
  private async restoreIngredients(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const usages = await tx.orderIngredientUsage.findMany({
      where: {
        orderId,
      },
      orderBy: {
        ingredientId: 'asc',
      },
    });

    for (const usage of usages) {
      await tx.ingredient.update({
        where: {
          ingredientId: usage.ingredientId,
        },
        data: {
          stock: {
            increment: usage.quantity,
          },
        },
      });
    }
  }

  // Hoàn Product.stock theo snapshot, không theo toàn bộ món trong đơn.
  private async restoreOrderStock(
    tx: Prisma.TransactionClient,
    usages: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    for (const usage of usages) {
      await tx.product.update({
        where: {
          productId: usage.productId,
        },
        data: {
          stock: {
            increment: usage.quantity,
          },
          version: {
            increment: 1,
          },
        },
      });
    }
  }

  /**
   * Lazy expiry: hủy một đơn đã quá hạn thanh toán ngay trong transaction hiện tại.
   * Dùng updateMany có điều kiện status + createdAt nên chỉ một request thắng;
   * request thua nhận count = 0 và không hoàn kho/nguyên liệu lần hai.
   */
  private async expireOrderRecord(
    tx: Prisma.TransactionClient,
    order: {
      orderId: string;
      status: OrderStatus;
      createdAt: Date;
      productStockUsages: Array<{ productId: string; quantity: number }>;
    },
    now: Date,
  ): Promise<boolean> {
    if (!this.isPaymentExpired(order, now)) {
      return false;
    }

    const cutoff = new Date(now.getTime() - this.getPaymentTimeoutMs());
    const locked = await tx.order.updateMany({
      where: {
        orderId: order.orderId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        createdAt: { lte: cutoff },
      },
      data: {
        status: OrderStatus.CANCELLED,
        cancelReason: CancelReason.SYSTEM_EXPIRED,
        cancelledAt: now,
        cancelledBy: null,
      },
    });

    if (locked.count === 0) {
      return false;
    }

    await this.restoreOrderStock(tx, order.productStockUsages);
    await this.restoreIngredients(tx, order.orderId);
    return true;
  }

  /**
   * Hủy đơn quá hạn thanh toán theo cơ chế lazy expiry.
   * Trả true nếu request này là bên thắng và đã hoàn kho; false nếu đơn
   * không quá hạn hoặc đã bị request khác xử lý trước.
   */
  async expireOrderIfNeeded(orderId: string): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { orderId },
        include: { productStockUsages: true },
      });

      if (!order) {
        return false;
      }

      return this.expireOrderRecord(tx, order, now);
    });
  }

  /**
   * Quét các đơn chưa thanh toán đã quá hạn của một user (dùng cho GET /orders/me).
   * Không dùng cron/scheduler: mỗi lần đọc danh sách sẽ dọn các đơn quá hạn.
   */
  async expireOverdueOrdersForUser(userId: string): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.getPaymentTimeoutMs());
    const overdueOrders = await this.prisma.order.findMany({
      where: {
        userId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        createdAt: { lte: cutoff },
      },
      select: { orderId: true },
    });

    let expiredCount = 0;
    for (const order of overdueOrders) {
      if (await this.expireOrderIfNeeded(order.orderId)) {
        expiredCount += 1;
      }
    }
    return expiredCount;
  }

  // Xem lịch sử đơn hàng theo ID khách hàng.
  async getMyOrders(userId: string) {
    // Lazy expiry: dọn các đơn quá hạn của user trước khi trả danh sách.
    await this.expireOverdueOrdersForUser(userId);

    const orders = await this.prisma.order.findMany({
      where: {
        userId,
      },
      include: {
        items: {
          include: {
            options: true,
            product: {
              select: {
                imageUrl: true,
              },
            },
          },
        },
        promotion: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map((order) =>
      this.mapOrderResponse(order),
    );
  }

  // Xem chi tiết đơn hàng.
  async getOrderById(
    orderId: string,
    userId: string,
    role?: UserRole,
  ) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        orderId,
      );

    const order = await this.prisma.order.findFirst({
      where: isUuid
        ? {
            OR: [
              { orderId },
              { orderCode: orderId },
            ],
          }
        : {
            orderCode: orderId,
          },
      include: {
        items: {
          include: {
            options: true,
            product: {
              select: {
                imageUrl: true,
              },
            },
          },
        },
        promotion: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Không tìm thấy đơn hàng với mã: ${orderId}`,
      );
    }

    if (
      order.userId !== userId &&
      role !== UserRole.STAFF
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền xem thông tin đơn hàng này.',
      );
    }

    // Lazy expiry: xem chi tiết cũng là điểm kích hoạt dọn đơn quá hạn.
    if (this.isPaymentExpired(order)) {
      const expired = await this.expireOrderIfNeeded(order.orderId);
      if (expired) {
        const refreshed = await this.prisma.order.findFirst({
          where: { orderId: order.orderId },
          include: {
            items: {
              include: {
                options: true,
                product: {
                  select: {
                    imageUrl: true,
                  },
                },
              },
            },
            promotion: true,
          },
        });
        if (refreshed) {
          return this.mapOrderResponse(refreshed);
        }
      }
    }

    return this.mapOrderResponse(order);
  }

  // Hủy đơn và hoàn trả nguyên liệu hoặc sản phẩm.
  async cancelOrder(
    orderId: string,
    userId: string,
    role?: UserRole,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            orderId,
          },
          include: {
            items: true,
            productStockUsages: true,
          },
        });

        if (!order) {
          throw new NotFoundException(
            `Không tìm thấy đơn hàng với mã: ${orderId}`,
          );
        }

        if (
          order.userId !== userId &&
          role !== UserRole.STAFF
        ) {
          throw new ForbiddenException(
            'Bạn không có quyền hủy đơn hàng này.',
          );
        }

        // Khách chỉ được hủy đơn chưa thanh toán.
        const customerCanCancel =
          order.status === OrderStatus.PENDING ||
          order.status === OrderStatus.PAYMENT_FAILED;

        if (
          !customerCanCancel &&
          role !== UserRole.STAFF
        ) {
          throw new ForbiddenException(
            'Đơn hàng đã thanh toán hoặc đang xử lý, chỉ nhân viên mới có thể hủy.',
          );
        }

        OrderStateMachine.assertTransition(
          order.status,
          OrderStatus.CANCELLED,
        );

        const cancelledAt = new Date();
        const cancelReason =
          role === UserRole.STAFF ? CancelReason.STAFF : CancelReason.CUSTOMER;

        // Chốt trạng thái nguyên tử.
        const locked = await tx.order.updateMany({
          where: {
            orderId,
            status: order.status,
          },
          data: {
            status: OrderStatus.CANCELLED,
            cancelReason,
            cancelledAt,
            cancelledBy: userId,
          },
        });

        if (locked.count === 0) {
          throw new ConflictException(
            'Đơn hàng vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.',
          );
        }

        // Hoàn Product.stock theo snapshot.
        await this.restoreOrderStock(tx, order.productStockUsages);

        // Hoàn Ingredient.stock theo snapshot.
        await this.restoreIngredients(
          tx,
          order.orderId,
        );

        // Hoàn điểm nếu đơn đã thanh toán.
        if (order.status === OrderStatus.PAID) {
          await this.loyaltyService.reversePoints(
            order.userId,
            order.orderId,
          );
        }

        const updated = await tx.order.findUniqueOrThrow({
          where: {
            orderId,
          },
          include: {
            items: {
              include: {
                options: true,
                product: {
                  select: {
                    imageUrl: true,
                  },
                },
              },
            },
            promotion: true,
          },
        });

        return this.mapOrderResponse(updated);
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  // Cập nhật trạng thái đơn hàng.
  async updateStatus(
    orderId: string,
    nextStatus: OrderStatus,
  ) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          orderId,
        },
        include: {
          productStockUsages: true,
        },
      });

      if (!order) {
        throw new NotFoundException(
          `Không tìm thấy đơn hàng với mã: ${orderId}`,
        );
      }

      // Không throw trong transaction để tránh rollback thao tác tự hủy.
      if (this.isPaymentExpired(order, now)) {
        await this.expireOrderRecord(tx, order, now);
        return null;
      }

      OrderStateMachine.assertTransition(
        order.status,
        nextStatus,
      );

      return tx.order.update({
        where: {
          orderId,
        },
        data: {
          status: nextStatus,
        },
        include: {
          items: {
            include: {
              options: true,
              product: {
                select: {
                  imageUrl: true,
                },
              },
            },
          },
          promotion: true,
        },
      });
    });

    if (!result) {
      throw new ConflictException(
        'Đơn hàng đã quá hạn thanh toán và đã bị hủy tự động, không thể chuyển trạng thái.',
      );
    }

    return this.mapOrderResponse(result);
  }
}
