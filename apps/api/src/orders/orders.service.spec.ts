import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CancelReason, OptionType, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { OrdersService } from './orders.service';

describe('OrdersService (FR-05, FR-08, FR-09, FR-10, NFR-05, CV21)', () => {
  let service: OrdersService;
  let mockLoyaltyService: {
    earnPoints: jest.Mock;
    reversePoints: jest.Mock;
    getPoints: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
    product: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    promotion: {
      findUnique: jest.Mock;
    };
    productIngredient: { findMany: jest.Mock };
    ingredient: { updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    orderIngredientUsage: { createMany: jest.Mock; findMany: jest.Mock };
    orderProductStockUsage: { createMany: jest.Mock; findMany: jest.Mock };
    order: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  const mockProduct = {
    productId: 'prod-uuid-1',
    name: 'Cà phê Sữa Đá Truyền Thống',
    description: 'Đậm đà hương vị cà phê Robusta',
    basePrice: new Prisma.Decimal(29000),
    stock: 50,
    version: 0,
    status: 'ACTIVE',
    options: [
      {
        optionId: 'opt-size-m',
        productId: 'prod-uuid-1',
        name: 'Size M (+50ml)',
        type: OptionType.SIZE,
        priceAdjustment: new Prisma.Decimal(6000),
        isAvailable: true,
      },
      {
        optionId: 'opt-top-cheese',
        productId: 'prod-uuid-1',
        name: 'Kem Cheese béo ngậy',
        type: OptionType.TOPPING,
        priceAdjustment: new Prisma.Decimal(10000),
        isAvailable: true,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      }),
      product: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      promotion: {
        findUnique: jest.fn(),
      },
      // Mặc định món không có công thức nguyên liệu (không ràng buộc), các test nguyên liệu nằm ở file riêng.
      productIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      ingredient: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      orderIngredientUsage: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Service ghi/đọc lượng tồn kho món đã trừ theo đơn để hoàn đúng khi hủy.
      orderProductStockUsage: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    mockLoyaltyService = {
      earnPoints: jest.fn(),
      reversePoints: jest.fn(),
      getPoints: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        PromotionsService,
        { provide: LoyaltyService, useValue: mockLoyaltyService },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback?: unknown) => fallback },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('createOrder (FR-05, NFR-05)', () => {
    it('tính toán lại giá từ database (Base 29k + Size M 6k + Topping 10k = 45k x 2 = 90k)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany.mockResolvedValue({ count: 1 }); // trừ kho thành công
      prisma.order.create.mockImplementation(async ({ data }: { data: any }) => ({
        orderId: 'order-1',
        ...data,
        items: data.items.create.map((it: any, index: number) => ({
          orderItemId: `item-${index}`,
          ...it,
          options: (it.options?.create || []).map((opt: any, oIdx: number) => ({
            orderItemOptionId: `opt-${oIdx}`,
            ...opt,
          })),
        })),
      }));

      const result = await service.createOrder('user-1', {
        items: [
          {
            productId: mockProduct.productId,
            quantity: 2,
            sizeOptionId: 'opt-size-m',
            toppingOptionIds: ['opt-top-cheese'],
          },
        ],
      });

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { productId: mockProduct.productId, version: 0, stock: { gte: 2 } },
        data: { stock: { decrement: 2 }, version: { increment: 1 } },
      });
      expect(result.subtotal).toBe(90000);
      expect(result.totalAmount).toBe(90000);
      expect(result.discountAmount).toBe(0);
      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('từ chối khi tồn kho không đủ (chống oversell theo CONC-T01)', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          ...mockProduct,
          stock: 1, // Chỉ còn 1 sản phẩm
        },
      ]);
      prisma.product.updateMany.mockResolvedValue({ count: 0 });
      prisma.product.findUnique.mockResolvedValue({ stock: 1, name: mockProduct.name });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi sản phẩm không tồn tại', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: 'non-existent-id', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi sản phẩm đã ngừng bán (status != ACTIVE)', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          ...mockProduct,
          status: 'HIDDEN',
        },
      ]);

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('áp dụng mã khuyến mãi hợp lệ và trừ tiền chính xác (FR-09)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-1',
        code: 'GIAM10K',
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal(10000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(20000),
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        status: 'ACTIVE',
      });
      prisma.order.create.mockImplementation(async ({ data }: { data: any }) => ({
        orderId: 'order-promo',
        ...data,
        items: [],
      }));

      const result = await service.createOrder('user-1', {
        items: [{ productId: mockProduct.productId, quantity: 1 }],
        promoCode: 'GIAM10K',
      });

      expect(result.subtotal).toBe(29000);
      expect(result.discountAmount).toBe(10000);
      expect(result.totalAmount).toBe(19000);
    });

    it('từ chối khi mã khuyến mãi không tồn tại trên hệ thống (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.promotion.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
          promoCode: 'SAIMATROI',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi mã khuyến mãi đã hết hạn (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-expired',
        code: 'HETHAN',
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal(10000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(20000),
        startAt: new Date(Date.now() - 7200000),
        endAt: new Date(Date.now() - 3600000),
        status: 'ACTIVE',
      });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
          promoCode: 'HETHAN',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi mã khuyến mãi chưa đến thời gian áp dụng (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-future',
        code: 'CHOGIO',
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal(10000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(20000),
        startAt: new Date(Date.now() + 3600000),
        endAt: new Date(Date.now() + 7200000),
        status: 'ACTIVE',
      });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
          promoCode: 'CHOGIO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi mã khuyến mãi có trạng thái INACTIVE (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-inactive',
        code: 'KHOA',
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal(10000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(20000),
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        status: 'INACTIVE',
      });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
          promoCode: 'KHOA',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi đơn hàng chưa đạt giá trị tối thiểu của mã khuyến mãi (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]); // 29,000 VND
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-min',
        code: 'TOITHIEU50K',
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal(10000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(50000),
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        status: 'ACTIVE',
      });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
          promoCode: 'TOITHIEU50K',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('áp dụng mã khuyến mãi theo phần trăm có trần maxDiscount chính xác (CV21)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      // Giảm 50% trần tối đa 10,000 cho đơn 29,000 -> giảm 10,000 thay vì 14,500
      prisma.promotion.findUnique.mockResolvedValue({
        promotionId: 'promo-percent',
        code: 'GIAM50',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(50),
        maxDiscount: new Prisma.Decimal(10000),
        minimumOrderAmount: new Prisma.Decimal(20000),
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        status: 'ACTIVE',
      });
      prisma.order.create.mockImplementation(async ({ data }: { data: any }) => ({
        orderId: 'order-percent',
        ...data,
        items: [],
      }));

      const result = await service.createOrder('user-1', {
        items: [{ productId: mockProduct.productId, quantity: 1 }],
        promoCode: 'GIAM50',
      });

      expect(result.subtotal).toBe(29000);
      expect(result.discountAmount).toBe(10000);
      expect(result.totalAmount).toBe(19000);
    });

    it('kiểm soát tồn kho bằng optimistic locking (version) khi trừ stock (CV18)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.create.mockImplementation(async ({ data }: { data: any }) => ({
        orderId: 'order-optimistic',
        ...data,
        items: [],
      }));

      await service.createOrder('user-1', {
        items: [{ productId: mockProduct.productId, quantity: 2 }],
      });

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: {
          productId: mockProduct.productId,
          version: mockProduct.version,
          stock: { gte: 2 },
        },
        data: {
          stock: { decrement: 2 },
          version: { increment: 1 },
        },
      });
    });

    it('báo lỗi rõ ràng khi cập nhật thất bại do hết hàng trong kho (CV18)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany.mockResolvedValue({ count: 0 });
      prisma.product.findUnique.mockResolvedValue({
        stock: 0,
        name: mockProduct.name,
      });

      await expect(
        service.createOrder('user-1', {
          items: [{ productId: mockProduct.productId, quantity: 1 }],
        }),
      ).rejects.toThrow('không đủ hàng');
    });

    it('tự động retry và thành công khi gặp xung đột version đồng thời nhưng kho vẫn còn đủ hàng (CV18)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.product.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      prisma.product.findUnique.mockResolvedValue({
        stock: 45,
        name: mockProduct.name,
      });
      prisma.order.create.mockImplementation(async ({ data }: { data: any }) => ({
        orderId: 'order-retry-success',
        ...data,
        items: [],
      }));

      const result = await service.createOrder('user-1', {
        items: [{ productId: mockProduct.productId, quantity: 1 }],
      });

      expect(result).toBeDefined();
      expect(prisma.product.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelOrder', () => {
    it('hủy đơn hàng hợp lệ và hoàn lại số lượng tồn kho', async () => {
      const pendingOrder = {
        orderId: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING,
        items: [{ productId: mockProduct.productId, quantity: 3 }],
        productStockUsages: [{ productId: mockProduct.productId, quantity: 3 }],
      };

      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.CANCELLED,
        items: [],
      });

      const cancelled = await service.cancelOrder('order-1', 'user-1');

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { productId: mockProduct.productId },
        data: { stock: { increment: 3 }, version: { increment: 1 } },
      });
    });

    it('khách tự hủy -> lưu cancelReason CUSTOMER, cancelledAt và cancelledBy', async () => {
      const pendingOrder = {
        orderId: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING,
        items: [],
        productStockUsages: [],
      };

      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.CANCELLED,
      });

      await service.cancelOrder('order-1', 'user-1', UserRole.CUSTOMER);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1', status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.CANCELLED,
          cancelReason: CancelReason.CUSTOMER,
          cancelledAt: expect.any(Date),
          cancelledBy: 'user-1',
        }),
      });
    });

    it('nhân viên hủy -> lưu cancelReason STAFF và cancelledBy là id nhân viên', async () => {
      const paidOrder = {
        orderId: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PAID,
        items: [],
        productStockUsages: [],
      };

      prisma.order.findFirst.mockResolvedValue(paidOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...paidOrder,
        status: OrderStatus.CANCELLED,
      });

      await service.cancelOrder('order-1', 'staff-1', UserRole.STAFF);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1', status: OrderStatus.PAID },
        data: expect.objectContaining({
          status: OrderStatus.CANCELLED,
          cancelReason: CancelReason.STAFF,
          cancelledAt: expect.any(Date),
          cancelledBy: 'staff-1',
        }),
      });
    });

    it('khách không được huỷ đơn đã thanh toán', async () => {
      prisma.order.findFirst.mockResolvedValue({
        orderId: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PAID,
        items: [],
      });
      await expect(service.cancelOrder('order-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('không hoàn kho khi đơn vừa bị request khác hủy (count = 0)', async () => {
      prisma.order.findFirst.mockResolvedValue({
        orderId: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING,
        items: [{ productId: mockProduct.productId, quantity: 3 }],
        productStockUsages: [{ productId: mockProduct.productId, quantity: 3 }],
      });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelOrder('order-1', 'user-1')).rejects.toThrow(ConflictException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('chặn người dùng khác hủy đơn hàng không thuộc về mình', async () => {
      const pendingOrder = {
        orderId: 'order-1',
        userId: 'user-owner',
        status: OrderStatus.PENDING,
        items: [],
      };

      prisma.order.findFirst.mockResolvedValue(pendingOrder);

      await expect(
        service.cancelOrder('order-1', 'user-intruder', UserRole.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('báo lỗi NotFoundException khi đơn hàng không tồn tại', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.cancelOrder('non-existent-order', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    describe('chặn chuyển trạng thái sai bằng OrderStateMachine (FR-08)', () => {
      const orderWith = (status: OrderStatus) => ({
        orderId: 'order-1',
        userId: 'user-1',
        status,
        items: [{ productId: mockProduct.productId, quantity: 3 }],
        productStockUsages: [{ productId: mockProduct.productId, quantity: 3 }],
      });

      it('nhân viên không được hủy lại đơn đã CANCELLED (tránh hoàn kho lần hai)', async () => {
        prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.CANCELLED));
        prisma.order.updateMany.mockResolvedValue({ count: 1 });

        await expect(service.cancelOrder('order-1', 'staff-1', UserRole.STAFF)).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.order.updateMany).not.toHaveBeenCalled();
        expect(prisma.product.update).not.toHaveBeenCalled();
      });

      it('nhân viên không được hủy đơn đã COMPLETED (trạng thái cuối)', async () => {
        prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.COMPLETED));

        await expect(service.cancelOrder('order-1', 'staff-1', UserRole.STAFF)).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.product.update).not.toHaveBeenCalled();
      });

      it('nhân viên không được hủy đơn đang PREPARING (thiết kế chỉ cho PAID → CANCELLED)', async () => {
        prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PREPARING));

        await expect(service.cancelOrder('order-1', 'staff-1', UserRole.STAFF)).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.product.update).not.toHaveBeenCalled();
      });

      it('nhân viên hủy đơn PAID thì được phép và hoàn kho (PAID → CANCELLED)', async () => {
        prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PAID));
        prisma.order.updateMany.mockResolvedValue({ count: 1 });
        prisma.order.findUniqueOrThrow.mockResolvedValue({
          ...orderWith(OrderStatus.CANCELLED),
          items: [],
        });

        const cancelled = await service.cancelOrder('order-1', 'staff-1', UserRole.STAFF);

        expect(cancelled.status).toBe(OrderStatus.CANCELLED);
        expect(prisma.product.update).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('updateStatus (FR-08, luồng KDS)', () => {
    const orderWith = (status: OrderStatus) => ({ orderId: 'order-1', userId: 'user-1', status });

    it('cho phép PAID → PREPARING', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PAID));
      prisma.order.update.mockResolvedValue({ ...orderWith(OrderStatus.PREPARING), items: [] });

      const updated = await service.updateStatus('order-1', OrderStatus.PREPARING);

      expect(updated.status).toBe(OrderStatus.PREPARING);
      expect(prisma.order.update).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['nhảy cóc PAID → COMPLETED', OrderStatus.PAID, OrderStatus.COMPLETED],
      ['đi lùi READY → PREPARING', OrderStatus.READY, OrderStatus.PREPARING],
      ['đơn chưa thanh toán PENDING → PREPARING', OrderStatus.PENDING, OrderStatus.PREPARING],
      ['giữ nguyên trạng thái PAID → PAID', OrderStatus.PAID, OrderStatus.PAID],
      ['rời trạng thái cuối COMPLETED → READY', OrderStatus.COMPLETED, OrderStatus.READY],
    ])('chặn %s và không ghi DB', async (_name, from, to) => {
      prisma.order.findFirst.mockResolvedValue(orderWith(from));

      await expect(service.updateStatus('order-1', to)).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('báo NotFoundException khi đơn hàng không tồn tại', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('khong-co', OrderStatus.PREPARING)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('lazy expiry (tự hủy đơn quá hạn thanh toán)', () => {
    const overdueAt = () => new Date(Date.now() - 16 * 60 * 1000);
    const recentAt = () => new Date(Date.now() - 60 * 1000);
    const orderWith = (
      status: OrderStatus,
      createdAt: Date,
      productStockUsages: Array<{ productId: string; quantity: number }> = [
        { productId: 'prod-1', quantity: 2 },
      ],
    ) => ({
      orderId: 'order-expire',
      userId: 'user-1',
      status,
      createdAt,
      items: [{ productId: 'prod-1', quantity: 2 }],
      productStockUsages,
    });

    it('đơn PENDING quá hạn -> CANCELLED, hoàn kho + nguyên liệu', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PENDING, overdueAt()));
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.orderIngredientUsage.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', quantity: 10 },
      ]);

      const expired = await service.expireOrderIfNeeded('order-expire');

      expect(expired).toBe(true);
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orderId: 'order-expire',
            status: {
              in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
            },
            createdAt: { lte: expect.any(Date) },
          },
          data: expect.objectContaining({
            status: OrderStatus.CANCELLED,
            cancelReason: CancelReason.SYSTEM_EXPIRED,
            cancelledAt: expect.any(Date),
            cancelledBy: null,
          }),
        }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        data: { stock: { increment: 2 }, version: { increment: 1 } },
      });
      expect(prisma.ingredient.update).toHaveBeenCalledWith({
        where: { ingredientId: 'ing-1' },
        data: { stock: { increment: 10 } },
      });
    });

    it('đơn PAYMENT_FAILED quá hạn -> CANCELLED', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderWith(OrderStatus.PAYMENT_FAILED, overdueAt()),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const expired = await service.expireOrderIfNeeded('order-expire');

      expect(expired).toBe(true);
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.CANCELLED,
            cancelReason: CancelReason.SYSTEM_EXPIRED,
          }),
        }),
      );
    });

    it('món dùng nguyên liệu không được hoàn thêm Product.stock khi quá hạn', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderWith(OrderStatus.PENDING, overdueAt(), []),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.orderIngredientUsage.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', quantity: new Prisma.Decimal('12.500') },
      ]);

      expect(await service.expireOrderIfNeeded('order-expire')).toBe(true);
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.ingredient.update).toHaveBeenCalledWith({
        where: { ingredientId: 'ing-1' },
        data: { stock: { increment: new Prisma.Decimal('12.500') } },
      });
    });

    it('đơn hỗn hợp quá hạn chỉ hoàn Product.stock theo snapshot đã trừ', async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...orderWith(OrderStatus.PENDING, overdueAt(), [
          { productId: 'prod-stock', quantity: 1 },
        ]),
        items: [
          { productId: 'prod-recipe', quantity: 2 },
          { productId: 'prod-stock', quantity: 3 },
        ],
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.orderIngredientUsage.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', quantity: 10 },
      ]);

      expect(await service.expireOrderIfNeeded('order-expire')).toBe(true);
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { productId: 'prod-stock' },
        data: { stock: { increment: 1 }, version: { increment: 1 } },
      });
      expect(prisma.ingredient.update).toHaveBeenCalledTimes(1);
    });

    it('request tự hủy thua chốt trạng thái không được hoàn kho/nguyên liệu', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderWith(OrderStatus.PENDING, overdueAt()),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.expireOrderIfNeeded('order-expire')).toBe(false);
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.orderIngredientUsage.findMany).not.toHaveBeenCalled();
      expect(prisma.ingredient.update).not.toHaveBeenCalled();
    });

    it('đổi trạng thái đơn quá hạn phải commit hủy trước khi trả 409', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderWith(OrderStatus.PENDING, overdueAt()),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      let committed = false;
      prisma.$transaction.mockImplementation(async (callback) => {
        const result = await callback(prisma);
        committed = true;
        return result;
      });

      await expect(
        service.updateStatus('order-expire', OrderStatus.PREPARING),
      ).rejects.toThrow(ConflictException);

      expect(committed).toBe(true);
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('đơn chưa quá hạn -> không đổi trạng thái, không hoàn kho', async () => {
      prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PENDING, recentAt()));

      const expired = await service.expireOrderIfNeeded('order-expire');

      expect(expired).toBe(false);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PAID, OrderStatus.PREPARING])(
      'đơn %s không bị hủy tự động dù createdAt cũ',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue(orderWith(status, overdueAt()));

        const expired = await service.expireOrderIfNeeded('order-expire');

        expect(expired).toBe(false);
        expect(prisma.order.updateMany).not.toHaveBeenCalled();
        expect(prisma.product.update).not.toHaveBeenCalled();
      },
    );

    it('gọi expire 2 lần chỉ hoàn kho/nguyên liệu đúng một lần', async () => {
      let status: OrderStatus = OrderStatus.PENDING;
      prisma.order.findFirst.mockImplementation(async () =>
        orderWith(status, overdueAt()),
      );
      prisma.order.updateMany.mockImplementation(async () => {
        if (status === OrderStatus.PENDING) {
          status = OrderStatus.CANCELLED;
          return { count: 1 };
        }
        return { count: 0 };
      });
      prisma.orderIngredientUsage.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', quantity: 5 },
      ]);

      const first = await service.expireOrderIfNeeded('order-expire');
      const second = await service.expireOrderIfNeeded('order-expire');

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
      expect(prisma.ingredient.update).toHaveBeenCalledTimes(1);
    });

    it('race expireOrder vs cancelOrder: expire thắng thì cancelOrder nhận 409 và chỉ hoàn kho một lần', async () => {
      let updateAttempts = 0;
      prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PENDING, overdueAt()));
      prisma.order.updateMany.mockImplementation(async () => {
        updateAttempts += 1;
        return updateAttempts === 1 ? { count: 1 } : { count: 0 };
      });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...orderWith(OrderStatus.CANCELLED, overdueAt()),
        items: [],
      });

      const expired = await service.expireOrderIfNeeded('order-expire');

      await expect(
        service.cancelOrder('order-expire', 'user-1', UserRole.CUSTOMER),
      ).rejects.toThrow(ConflictException);

      expect(expired).toBe(true);
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
    });

    it('race cancelOrder vs expireOrder: cancelOrder thắng thì expire bỏ qua, không hoàn kho lần hai', async () => {
      let updateAttempts = 0;
      prisma.order.findFirst.mockResolvedValue(orderWith(OrderStatus.PENDING, overdueAt()));
      prisma.order.updateMany.mockImplementation(async () => {
        updateAttempts += 1;
        return updateAttempts === 1 ? { count: 1 } : { count: 0 };
      });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...orderWith(OrderStatus.CANCELLED, overdueAt()),
        items: [],
      });

      const cancelled = await service.cancelOrder(
        'order-expire',
        'user-1',
        UserRole.CUSTOMER,
      );
      const expired = await service.expireOrderIfNeeded('order-expire');

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(expired).toBe(false);
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
    });

    it('GET /orders/:id sẽ hủy đơn quá hạn và trả CANCELLED', async () => {
      const pending = {
        ...orderWith(OrderStatus.PENDING, overdueAt()),
        orderCode: 'BL-EXPIRE-1',
        subtotal: new Prisma.Decimal(29000),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(29000),
        promotion: null,
      };
      const cancelled = {
        ...pending,
        status: OrderStatus.CANCELLED,
        cancelReason: CancelReason.SYSTEM_EXPIRED,
      };
      prisma.order.findFirst
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(cancelled);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.getOrderById(
        'order-expire',
        'user-1',
        UserRole.CUSTOMER,
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.order.findFirst).toHaveBeenLastCalledWith({
        where: { orderId: 'order-expire' },
        include: {
          items: {
            include: { options: true, product: { select: { imageUrl: true } } },
          },
          promotion: true,
        },
      });
    });

    it('GET /orders/me quét và hủy các đơn quá hạn của user trước khi trả danh sách', async () => {
      prisma.order.findMany
        .mockResolvedValueOnce([{ orderId: 'order-expire' }])
        .mockResolvedValueOnce([]);
      prisma.order.findFirst.mockResolvedValue(
        orderWith(OrderStatus.PENDING, overdueAt()),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const orders = await service.getMyOrders('user-1');

      expect(orders).toEqual([]);
      expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMyOrders (FR-07, CV16)', () => {
    it('trả về danh sách đơn hàng của chính user với đầy đủ mã đơn, trạng thái, tổng, ngày, items', async () => {
      const mockDate = new Date();
      prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          orderId: 'order-1',
          orderCode: 'BL-20261024-0001',
          userId: 'user-1',
          promotionId: null,
          subtotal: new Prisma.Decimal(45000),
          discountAmount: new Prisma.Decimal(5000),
          totalAmount: new Prisma.Decimal(40000),
          status: OrderStatus.PENDING,
          createdAt: mockDate,
          items: [
            {
              orderItemId: 'item-1',
              orderId: 'order-1',
              productId: 'prod-1',
              productName: 'Cà phê Sữa Đá',
              quantity: 1,
              unitPrice: new Prisma.Decimal(45000),
              subtotal: new Prisma.Decimal(45000),
              options: [
                {
                  orderItemOptionId: 'opt-1',
                  optionName: 'Size L',
                  optionType: OptionType.SIZE,
                  priceAdjustment: new Prisma.Decimal(10000),
                },
              ],
            },
          ],
          promotion: null,
        },
      ]);

      const orders = await service.getMyOrders('user-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: {
          items: {
            include: { options: true, product: { select: { imageUrl: true } } },
          },
          promotion: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(orders).toHaveLength(1);
      const firstOrder = orders[0];
      // Kiểm tra đầy đủ thông tin: mã đơn, trạng thái, tổng, ngày, items
      expect(firstOrder.orderCode).toBe('BL-20261024-0001');
      expect(firstOrder.status).toBe(OrderStatus.PENDING);
      expect(firstOrder.totalAmount).toBe(40000);
      expect(firstOrder.createdAt).toEqual(mockDate);
      expect(firstOrder.items).toHaveLength(1);
      expect(firstOrder.items[0].productName).toBe('Cà phê Sữa Đá');
      expect(firstOrder.items[0].options[0].optionName).toBe('Size L');
    });
  });

  describe('getOrderById (FR-07, CV16 - Chi tiết đơn hàng cho màn hình xác nhận)', () => {
    const mockOrder = {
      orderId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      orderCode: 'BL-20261024-9999',
      userId: 'user-owner',
      promotionId: null,
      subtotal: new Prisma.Decimal(35000),
      discountAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(35000),
      status: OrderStatus.PENDING,
      createdAt: new Date(),
      items: [
        {
          orderItemId: 'item-uuid-1',
          orderId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          productId: 'prod-uuid-1',
          productName: 'Trà Đào Cam Sả',
          quantity: 1,
          unitPrice: new Prisma.Decimal(35000),
          subtotal: new Prisma.Decimal(35000),
          options: [],
        },
      ],
      promotion: null,
    };

    it('trả về chi tiết đơn hàng cho chính user sở hữu đơn (bằng UUID orderId)', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        'user-owner',
        UserRole.CUSTOMER,
      );

      expect(result.id).toBe('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d');
      expect(result.orderCode).toBe('BL-20261024-9999');
      expect(result.totalAmount).toBe(35000);
      expect(result.items).toHaveLength(1);
    });

    it('hỗ trợ tìm kiếm theo mã đơn hàng orderCode (không phải UUID)', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        'BL-20261024-9999',
        'user-owner',
        UserRole.CUSTOMER,
      );

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { orderCode: 'BL-20261024-9999' },
        include: {
          items: {
            include: { options: true, product: { select: { imageUrl: true } } },
          },
          promotion: true,
        },
      });
      expect(result.orderCode).toBe('BL-20261024-9999');
    });

    it('chặn người dùng khác xem đơn hàng không thuộc về mình (Chỉ trả đơn của chính user)', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);

      await expect(
        service.getOrderById(
          'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          'user-intruder',
          UserRole.CUSTOMER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cho phép tài khoản nhân viên (STAFF) xem chi tiết đơn hàng', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        'staff-user-id',
        UserRole.STAFF,
      );

      expect(result.id).toBe('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d');
      expect(result.totalAmount).toBe(35000);
    });

    it('báo lỗi NotFoundException khi không tìm thấy đơn hàng', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrderById('non-existent-order', 'user-owner', UserRole.CUSTOMER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOrder (CV21, FR-10)', () => {
    it('gọi loyaltyService.reversePoints khi hủy đơn hàng đã thanh toán PAID', async () => {
      const paidOrder = {
        orderId: 'order-paid',
        userId: 'user-owner',
        status: OrderStatus.PAID,
        items: [{ productId: 'prod-1', quantity: 2 }],
        productStockUsages: [{ productId: 'prod-1', quantity: 2 }],
      };

      prisma.order.findFirst.mockResolvedValue(paidOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.update.mockResolvedValue({});
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...paidOrder,
        status: OrderStatus.CANCELLED,
        subtotal: new Prisma.Decimal(50000),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(50000),
        items: [],
      });

      await service.cancelOrder('order-paid', 'user-owner', UserRole.STAFF);

      expect(mockLoyaltyService.reversePoints).toHaveBeenCalledWith('user-owner', 'order-paid');
    });

    it('không gọi loyaltyService.reversePoints khi hủy đơn chưa thanh toán PENDING', async () => {
      const pendingOrder = {
        orderId: 'order-pending',
        userId: 'user-owner',
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-1', quantity: 1 }],
        productStockUsages: [{ productId: 'prod-1', quantity: 1 }],
      };

      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.update.mockResolvedValue({});
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.CANCELLED,
        subtotal: new Prisma.Decimal(29000),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(29000),
        items: [],
      });

      await service.cancelOrder('order-pending', 'user-owner', UserRole.CUSTOMER);

      expect(mockLoyaltyService.reversePoints).not.toHaveBeenCalled();
    });
  });
});
