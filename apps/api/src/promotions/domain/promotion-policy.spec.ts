import { BadRequestException } from '@nestjs/common';
import { DiscountType, Prisma, PromotionStatus } from '@prisma/client';
import { PromotionData, PromotionPolicy } from './promotion-policy';

describe('PromotionPolicy', () => {
  const basePromo: PromotionData = {
    code: 'TESTCODE',
    discountType: DiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(10),
    maxDiscount: new Prisma.Decimal(20000),
    minimumOrderAmount: new Prisma.Decimal(50000),
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('2026-12-31T23:59:59.000Z'),
    status: PromotionStatus.ACTIVE,
  };

  describe('validate', () => {
    const validDate = new Date('2026-06-01T12:00:00.000Z');

    it('cho phép áp dụng khi mã hợp lệ và đủ điều kiện', () => {
      expect(() =>
        PromotionPolicy.validate(basePromo, 60000, validDate),
      ).not.toThrow();
    });

    it('từ chối khi trạng thái mã là INACTIVE', () => {
      const promo: PromotionData = {
        ...basePromo,
        status: PromotionStatus.INACTIVE,
      };

      expect(() =>
        PromotionPolicy.validate(promo, 60000, validDate),
      ).toThrow(BadRequestException);
      expect(() =>
        PromotionPolicy.validate(promo, 60000, validDate),
      ).toThrow('không còn hiệu lực');
    });

    it('từ chối khi mã chưa đến ngày bắt đầu áp dụng', () => {
      const beforeStart = new Date('2025-12-31T23:59:59.000Z');
      expect(() =>
        PromotionPolicy.validate(basePromo, 60000, beforeStart),
      ).toThrow(BadRequestException);
      expect(() =>
        PromotionPolicy.validate(basePromo, 60000, beforeStart),
      ).toThrow('chưa đến thời gian áp dụng');
    });

    it('từ chối khi mã đã hết hạn sử dụng', () => {
      const afterEnd = new Date('2027-01-01T00:00:00.000Z');
      expect(() =>
        PromotionPolicy.validate(basePromo, 60000, afterEnd),
      ).toThrow(BadRequestException);
      expect(() =>
        PromotionPolicy.validate(basePromo, 60000, afterEnd),
      ).toThrow('đã hết hạn');
    });

    it('từ chối khi đơn hàng chưa đạt giá trị tối thiểu', () => {
      expect(() =>
        PromotionPolicy.validate(basePromo, 49000, validDate),
      ).toThrow(BadRequestException);
      expect(() =>
        PromotionPolicy.validate(basePromo, 49000, validDate),
      ).toThrow('chưa đạt giá trị tối thiểu');
    });
  });

  describe('calculateDiscount', () => {
    it('tính phần trăm giảm giá chính xác và áp dụng mức trần maxDiscount', () => {
      // 10% của 300,000 là 30,000, nhưng trần là 20,000
      const discount = PromotionPolicy.calculateDiscount(basePromo, 300000);
      expect(discount).toBe(20000);
    });

    it('tính phần trăm giảm giá chính xác khi dưới mức trần maxDiscount', () => {
      // 10% của 100,000 là 10,000 (dưới trần 20,000)
      const discount = PromotionPolicy.calculateDiscount(basePromo, 100000);
      expect(discount).toBe(10000);
    });

    it('tính giảm giá cố định (FIXED) chính xác', () => {
      const fixedPromo: PromotionData = {
        ...basePromo,
        discountType: DiscountType.FIXED,
        discountValue: new Prisma.Decimal(15000),
        maxDiscount: null,
      };

      const discount = PromotionPolicy.calculateDiscount(fixedPromo, 50000);
      expect(discount).toBe(15000);
    });

    it('không cho phép số tiền giảm giá vượt quá giá trị đơn hàng', () => {
      const fixedPromo: PromotionData = {
        ...basePromo,
        discountType: DiscountType.FIXED,
        discountValue: new Prisma.Decimal(50000),
        maxDiscount: null,
        minimumOrderAmount: new Prisma.Decimal(0),
      };

      const discount = PromotionPolicy.calculateDiscount(fixedPromo, 30000);
      expect(discount).toBe(30000);
    });
  });
});
