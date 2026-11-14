
import { Prisma } from '@prisma/client';
import { toProductResponse, type ProductWithOptions } from './product-response';

function product(
  stock: number,
  ingredients: Array<{ name: string; stock: number; perServing: number }>,
): ProductWithOptions {
  return {
    productId: 'p1',
    name: 'Matcha latte',
    description: '',
    basePrice: new Prisma.Decimal(42000),
    imageUrl: '',
    stock,
    version: 0,
    status: 'ACTIVE',
    options: [],
    ingredients: ingredients.map((line, index) => ({
      productId: 'p1',
      ingredientId: `i${index}`,
      quantityPerServing: line.perServing,
      ingredient: {
        ingredientId: `i${index}`,
        name: line.name,
        unit: 'g',
        stock: line.stock,
      },
    })),
  } as unknown as ProductWithOptions;
}

describe('toProductResponse: món ngừng bán khi thiếu nguyên liệu', () => {
  it('món không có công thức giữ nguyên tồn kho và không thiếu gì', () => {
    const res = toProductResponse(product(30, []));
    expect(res.stock).toBe(30);
    expect(res.missingIngredients).toEqual([]);
  });

  it('đủ nguyên liệu: số bán được bị chặn bởi nguyên liệu cạn nhất', () => {
    const res = toProductResponse(
      product(30, [
        { name: 'Bột matcha', stock: 100, perServing: 5 },
        { name: 'Sữa tươi', stock: 3000, perServing: 150 },
      ]),
    );

    expect(res.stock).toBe(20);
    expect(res.missingIngredients).toEqual([]);
  });

  it('một nguyên liệu hết thì stock = 0 và nêu rõ nguyên liệu nào thiếu', () => {
    const res = toProductResponse(
      product(30, [
        { name: 'Bột matcha', stock: 0, perServing: 5 },
        { name: 'Sữa tươi', stock: 3000, perServing: 150 },
      ]),
    );

    expect(res.stock).toBe(0);
    expect(res.missingIngredients).toEqual(['Bột matcha']);
  });

  it('món có công thức không bị chặn bởi Product.stock', () => {
    const res = toProductResponse(
      product(3, [
        { name: 'Sữa tươi', stock: 99999, perServing: 150 },
      ]),
    );

    expect(res.stock).toBe(666);
  });

  it('Product.stock bằng 0 vẫn bán được nếu đủ nguyên liệu', () => {
    const res = toProductResponse(
      product(0, [
        { name: 'Sữa tươi', stock: 600, perServing: 150 },
      ]),
    );

    expect(res.stock).toBe(4);
    expect(res.missingIngredients).toEqual([]);
  });

  it('số ly giảm sau khi trừ nguyên liệu dù Product.stock không đổi', () => {
    const before = toProductResponse(
      product(50, [
        { name: 'Cà phê', stock: 2000, perServing: 20 },
        { name: 'Sữa đặc', stock: 3000, perServing: 30 },
      ]),
    );
    const after = toProductResponse(
      product(50, [
        { name: 'Cà phê', stock: 1980, perServing: 20 },
        { name: 'Sữa đặc', stock: 2970, perServing: 30 },
      ]),
    );

    expect(before.stock).toBe(100);
    expect(after.stock).toBe(99);
  });

  it('nguyên liệu nhập thêm làm tăng số ly mà không cần sửa Product.stock', () => {
    const before = toProductResponse(
      product(1, [{ name: 'Sữa tươi', stock: 150, perServing: 150 }]),
    );
    const after = toProductResponse(
      product(1, [{ name: 'Sữa tươi', stock: 600, perServing: 150 }]),
    );

    expect(before.stock).toBe(1);
    expect(after.stock).toBe(4);
  });
});
