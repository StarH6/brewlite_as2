import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionPolicy } from './domain/promotion-policy';

export type ApplyPromotionResult = {
  promotionId: string;
  code: string;
  discountAmount: number;
};

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tìm kiếm mã khuyến mãi theo code (chuẩn hóa trim & uppercase).
   */
  async findByCode(code: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const normalizedCode = code.trim().toUpperCase();
    return client.promotion.findUnique({
      where: { code: normalizedCode },
    });
  }

  /**
   * FR-09: Kiểm tra tính hợp lệ và áp dụng mã khuyến mãi cho đơn hàng.
   * Chấp nhận `tx` để chạy trong cùng Transaction của OrdersService.
   */
  async applyPromotion(
    code: string,
    subtotal: number,
    tx?: Prisma.TransactionClient,
    now: Date = new Date(),
  ): Promise<ApplyPromotionResult> {
    const client = tx || this.prisma;
    const normalizedCode = code.trim().toUpperCase();

    const promo = await client.promotion.findUnique({
      where: { code: normalizedCode },
    });

    if (!promo) {
      throw new BadRequestException(`Mã khuyến mãi "${normalizedCode}" không tồn tại trên hệ thống.`);
    }

    // Kiểm tra điều kiện (hạn dùng, trạng thái, giá trị đơn tối thiểu)
    PromotionPolicy.validate(promo, subtotal, now);

    // Tính số tiền giảm giá
    const discountAmount = PromotionPolicy.calculateDiscount(promo, subtotal);

    return {
      promotionId: promo.promotionId,
      code: promo.code,
      discountAmount,
    };
  }

  /**
   * Kiểm tra tính hợp lệ và tính thử số tiền giảm giá cho giỏ hàng.
   * Phục vụ việc xem trước (preview) và tự động trừ tiền phía UI mà không ném lỗi 400.
   */
  async validatePromotion(
    code: string,
    subtotal: number,
    now: Date = new Date(),
  ): Promise<{
    valid: boolean;
    code: string;
    discountAmount: number;
    message?: string;
  }> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      return {
        valid: false,
        code: '',
        discountAmount: 0,
        message: 'Vui lòng nhập mã khuyến mãi.',
      };
    }

    const promo = await this.prisma.promotion.findUnique({
      where: { code: normalizedCode },
    });

    if (!promo) {
      return {
        valid: false,
        code: normalizedCode,
        discountAmount: 0,
        message: `Mã khuyến mãi "${normalizedCode}" không tồn tại.`,
      };
    }

    try {
      PromotionPolicy.validate(promo, subtotal, now);
      const discountAmount = PromotionPolicy.calculateDiscount(promo, subtotal);
      return {
        valid: true,
        code: promo.code,
        discountAmount,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Mã khuyến mãi không đủ điều kiện sử dụng.';
      return {
        valid: false,
        code: promo.code,
        discountAmount: 0,
        message,
      };
    }
  }
}
