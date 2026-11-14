import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type IngredientResponse = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** Các món dùng nguyên liệu này và lượng cho mỗi phần. */
  usedBy: Array<{ productId: string; productName: string; quantityPerServing: number }>;
};

const WITH_RECIPES = {
  recipes: { include: { product: { select: { productId: true, name: true } } } },
} satisfies Prisma.IngredientInclude;

type IngredientWithRecipes = Prisma.IngredientGetPayload<{ include: typeof WITH_RECIPES }>;

function toResponse(ingredient: IngredientWithRecipes): IngredientResponse {
  return {
    id: ingredient.ingredientId,
    name: ingredient.name,
    unit: ingredient.unit,
    stock: ingredient.stock.toNumber(),
    usedBy: ingredient.recipes.map((recipe) => ({
      productId: recipe.product.productId,
      productName: recipe.product.name,
      quantityPerServing: recipe.quantityPerServing.toNumber(),
    })),
  };
}

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách nguyên liệu cho nhân viên theo dõi kho. */
  async findAll(): Promise<IngredientResponse[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
      include: WITH_RECIPES,
    });
    return ingredients.map(toResponse);
  }

  /**
   * Nhập thêm hoặc kiểm kê: đặt lại tồn kho của một nguyên liệu.
   * Nguyên liệu có lại thì các món dùng nó tự bán được trở lại, không cần sửa món.
   */
  async setStock(ingredientId: string, stock: number): Promise<IngredientResponse> {
    try {
      const updated = await this.prisma.ingredient.update({
        where: { ingredientId },
        data: { stock },
        include: WITH_RECIPES,
      });
      return toResponse(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException({
          statusCode: 404,
          code: 'INGREDIENT_NOT_FOUND',
          message: 'Không tìm thấy nguyên liệu.',
        });
      }
      throw error;
    }
  }
}
