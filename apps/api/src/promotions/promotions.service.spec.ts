import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscountType, Prisma, PromotionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let prisma: {
    promotion: {
      findUnique: jest.Mock;
    };
  };

  const mockPromo = {
    promotionId: 'promo-uuid-1',
    code: 'GIAM10K',
    discountType: DiscountType.FIXED,
    discountValue: new Prisma.Decimal(10000),
    maxDiscount: null,
    minimumOrderAmount: new Prisma.Decimal(30000),
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 3600000),
    status: PromotionStatus.ACTIVE,
  };

  beforeEach(async () => {
    prisma = {
      promotion: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
  });

  describe('applyPromotion', () => {
    it('áp dụng mã khuyến mãi hợp lệ thành công', async () => {
      prisma.promotion.findUnique.mockResolvedValue(mockPromo);

      const result = await service.applyPromotion('giam10k', 50000);

      expect(prisma.promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'GIAM10K' },
      });
      expect(result).toEqual({
        promotionId: 'promo-uuid-1',
        code: 'GIAM10K',
        discountAmount: 10000,
      });
    });

    it('từ chối khi mã không tồn tại trên hệ thống', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);

      await expect(service.applyPromotion('KHONGCO', 50000)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.applyPromotion('KHONGCO', 50000)).rejects.toThrow(
        'không tồn tại trên hệ thống',
      );
    });

    it('từ chối khi đơn hàng không đủ giá trị tối thiểu', async () => {
      prisma.promotion.findUnique.mockResolvedValue(mockPromo);

      await expect(service.applyPromotion('GIAM10K', 25000)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.applyPromotion('GIAM10K', 25000)).rejects.toThrow(
        'chưa đạt giá trị tối thiểu',
      );
    });

    it('sử dụng transaction client (tx) nếu được cung cấp', async () => {
      const mockTx = {
        promotion: {
          findUnique: jest.fn().mockResolvedValue(mockPromo),
        },
      } as unknown as Prisma.TransactionClient;

      const result = await service.applyPromotion('GIAM10K', 40000, mockTx);

      expect((mockTx as any).promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'GIAM10K' },
      });
      expect(prisma.promotion.findUnique).not.toHaveBeenCalled();
      expect(result.discountAmount).toBe(10000);
    });
  });

  describe('validatePromotion', () => {
    it('trả về valid: true và số tiền giảm giá khi mã hợp lệ', async () => {
      prisma.promotion.findUnique.mockResolvedValue(mockPromo);

      const result = await service.validatePromotion('GIAM10K', 50000);

      expect(result).toEqual({
        valid: true,
        code: 'GIAM10K',
        discountAmount: 10000,
      });
    });

    it('trả về valid: false và thông báo lỗi khi mã không tồn tại', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);

      const result = await service.validatePromotion('NOT_FOUND', 50000);

      expect(result).toEqual({
        valid: false,
        code: 'NOT_FOUND',
        discountAmount: 0,
        message: 'Mã khuyến mãi "NOT_FOUND" không tồn tại.',
      });
    });

    it('trả về valid: false và lý do khi đơn chưa đạt giá trị tối thiểu', async () => {
      prisma.promotion.findUnique.mockResolvedValue(mockPromo);

      const result = await service.validatePromotion('GIAM10K', 20000);

      expect(result.valid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.message).toContain('chưa đạt giá trị tối thiểu');
    });
  });
});
