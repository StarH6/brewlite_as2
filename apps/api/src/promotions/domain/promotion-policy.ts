import { BadRequestException } from '@nestjs/common';
import { DiscountType, Promotion, PromotionStatus } from '@prisma/client';

export type PromotionData = Pick<
  Promotion,
  'code' | 'discountType' | 'discountValue' | 'maxDiscount' | 'minimumOrderAmount' | 'startAt' | 'endAt' | 'status'
>;

/**
 * PromotionPolicy — Quy tắc nghiệp vụ thuần túy cho khuyến mãi (FR-09).
 * Không phụ thuộc I/O hay framework, dễ dàng unit test độc lập.
 */
export class PromotionPolicy {
  /**
   * Kiểm tra điều kiện áp dụng mã khuyến mãi.
   * Ném BadRequestException nếu mã không thỏa mãn điều kiện.
   */
  public static validate(promo: PromotionData, subtotal: number, now: Date = new Date()): void {
    if (promo.status !== PromotionStatus.ACTIVE) {
      throw new BadRequestException('Mã khuyến mãi hiện không còn hiệu lực.');
    }

    if (now < promo.startAt) {
      throw new BadRequestException('Mã khuyến mãi chưa đến thời gian áp dụng.');
    }

    if (now > promo.endAt) {
      throw new BadRequestException('Mã khuyến mãi đã hết hạn sử dụng.');
    }

    const minAmount = Number(promo.minimumOrderAmount);
    if (subtotal < minAmount) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${minAmount.toLocaleString('vi-VN')} đ để áp dụng mã này.`,
      );
    }
  }

  /**
   * Tính số tiền giảm giá dựa trên loại chiết khấu, giá trị đơn hàng và hạn mức trần.
   * Đảm bảo số tiền giảm giá không bao giờ vượt quá tổng tiền món (subtotal).
   */
  public static calculateDiscount(promo: PromotionData, subtotal: number): number {
    const value = Number(promo.discountValue);
    let discount = 0;

    if (promo.discountType === DiscountType.PERCENTAGE) {
      discount = (subtotal * value) / 100;
      if (promo.maxDiscount !== null && promo.maxDiscount !== undefined) {
        const maxDisc = Number(promo.maxDiscount);
        discount = Math.min(discount, maxDisc);
      }
    } else {
      discount = value;
    }

    // Không giảm quá subtotal
    discount = Math.min(discount, subtotal);

    // Làm tròn số tiền giảm
    return Math.max(0, Math.round(discount));
  }
}
