import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProductResponse, type ProductResponse } from './product-response';

const OPTIONS_INCLUDE = {
  where: { isAvailable: true },
  orderBy: [
    { type: 'asc' as const },
    { priceAdjustment: 'asc' as const },
    { name: 'asc' as const },
  ],
};

/** Công thức kèm tồn kho nguyên liệu, để biết món còn pha được không (không bán khi thiếu nguyên liệu). */
const INGREDIENTS_INCLUDE = { include: { ingredient: true } };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FR-01: chỉ trả món ACTIVE cho menu, kèm size/topping đang bán.
   * Các field được chọn qua include có kiểm soát; index Product(status), Product(name).
   */
  async findAll(): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }],
      include: { options: OPTIONS_INCLUDE, ingredients: INGREDIENTS_INCLUDE },
    });

    return products.map(toProductResponse);
  }

  /**
   * FR-02: chi tiết món + size/topping. Món HIDDEN coi như không tồn tại.
   */
  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: { productId: id, status: 'ACTIVE' },
      include: { options: OPTIONS_INCLUDE, ingredients: INGREDIENTS_INCLUDE },
    });

    if (!product) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PRODUCT_NOT_FOUND',
        message: 'Không tìm thấy sản phẩm.',
      });
    }

    return toProductResponse(product);
  }
}
