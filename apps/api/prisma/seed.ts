import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedProduct = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  imageUrl: string;
  stock: number;
};

type SeedOption = {
  name: string;
  type: 'SIZE' | 'TOPPING';
  priceAdjustment: number;
};

const PRODUCTS: SeedProduct[] = [
  {
    id: '11111111-1111-4111-8111-000000000001',
    name: 'Cà phê sữa đá',
    description: 'Cà phê phin đậm vị, sữa đặc béo ngậy, đá mát lạnh.',
    basePrice: 29000,
    imageUrl:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80',
    stock: 50,
  },
  {
    id: '11111111-1111-4111-8111-000000000002',
    name: 'Cà phê đen đá',
    description: 'Cà phê nguyên chất rang mộc, hương thơm và hậu vị sâu.',
    basePrice: 25000,
    imageUrl:
      'https://images.unsplash.com/photo-1618183507099-4fa269f9b0ee?auto=format&fit=crop&w=800&q=80',
    stock: 50,
  },
  {
    id: '11111111-1111-4111-8111-000000000003',
    name: 'Bạc xỉu',
    description: 'Nhiều sữa, ít cà phê, vị nhẹ nhàng dễ uống.',
    basePrice: 32000,
    imageUrl:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80',
    stock: 40,
  },
  {
    id: '11111111-1111-4111-8111-000000000004',
    name: 'Trà sữa trân châu',
    description: 'Trà đen đậm vị kết hợp sữa tươi và trân châu dai giòn.',
    basePrice: 39000,
    imageUrl:
      'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=800&q=80',
    stock: 40,
  },
  {
    id: '11111111-1111-4111-8111-000000000005',
    name: 'Trà đào cam sả',
    description: 'Trà đào thơm, cam tươi và sả tạo vị chua ngọt sảng khoái.',
    basePrice: 35000,
    imageUrl:
      'https://images.unsplash.com/photo-1676693420436-7fa448f054eb?auto=format&fit=crop&w=800&q=80',
    stock: 35,
  },
  {
    id: '11111111-1111-4111-8111-000000000006',
    name: 'Matcha latte',
    description: 'Matcha Nhật Bản xay mịn, sữa tươi và lớp bọt mềm.',
    basePrice: 42000,
    imageUrl:
      'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=800&q=80',
    stock: 30,
  },
  {
    id: '11111111-1111-4111-8111-000000000007',
    name: 'Sữa tươi trân châu đường đen',
    description: 'Sữa tươi mát lạnh, trân châu đường đen và sốt caramel.',
    basePrice: 45000,
    imageUrl:
      'https://images.unsplash.com/photo-1624781708944-041f4b7e4d09?auto=format&fit=crop&w=800&q=80',
    stock: 30,
  },
  {
    id: '11111111-1111-4111-8111-000000000008',
    name: 'Cacao nóng',
    description: 'Cacao đậm đà, sữa nóng và chút bột quế.',
    basePrice: 30000,
    imageUrl:
      'https://images.unsplash.com/photo-1637572815755-c4b80092dce1?auto=format&fit=crop&w=800&q=80',
    stock: 25,
  },
  {
    id: '11111111-1111-4111-8111-000000000009',
    name: 'Trà xanh chanh dây',
    description: 'Trà xanh thanh mát, chanh dây chua nhẹ và đá mát.',
    basePrice: 33000,
    imageUrl:
      'https://images.unsplash.com/photo-1786783506825-1bdc1d2acd72?auto=format&fit=crop&w=800&q=80',
    stock: 35,
  },
  {
    id: '11111111-1111-4111-8111-000000000010',
    name: 'Cà phê muối',
    description: 'Cà phê rang đậm với lớp kem muối mặn ngọt cân bằng.',
    basePrice: 35000,
    imageUrl:
      'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=800&q=80',
    stock: 45,
  },
  {
    id: '11111111-1111-4111-8111-000000000011',
    name: 'Cold brew cam',
    description: 'Cold brew ủ lạnh 18 giờ kết hợp nước cam tươi.',
    basePrice: 38000,
    imageUrl:
      'https://images.unsplash.com/photo-1603048004567-8109c99d4e7d?auto=format&fit=crop&w=800&q=80',
    stock: 20,
  },
  {
    id: '11111111-1111-4111-8111-000000000012',
    name: 'Sữa chua cà phê',
    description: 'Sữa chua mát, cà phê đậm và thạch giòn.',
    basePrice: 36000,
    imageUrl:
      'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80',
    stock: 25,
  },
];

const SIZES: SeedOption[] = [
  { name: 'S', type: 'SIZE', priceAdjustment: 0 },
  { name: 'M', type: 'SIZE', priceAdjustment: 5000 },
  { name: 'L', type: 'SIZE', priceAdjustment: 10000 },
];

const TOPPINGS: SeedOption[] = [
  { name: 'Trân châu', type: 'TOPPING', priceAdjustment: 5000 },
  { name: 'Thạch trái cây', type: 'TOPPING', priceAdjustment: 5000 },
  { name: 'Kem cheese', type: 'TOPPING', priceAdjustment: 8000 },
];

function optionId(sequence: number): string {
  return `22222222-2222-4222-8222-${String(sequence).padStart(12, '0')}`;
}

async function seedProducts(): Promise<void> {
  let sequence = 1;

  for (const product of PRODUCTS) {
    // Chỉ khởi tạo stock khi tạo mới; không thay đổi kho khi seed lại.
    // Product dùng productId làm khóa chính, không phải id.
    await prisma.product.upsert({
      where: {
        productId: product.id,
      },
      update: {
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        imageUrl: product.imageUrl,
        status: 'ACTIVE',
      },
      create: {
        productId: product.id,
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        imageUrl: product.imageUrl,
        stock: product.stock,
        status: 'ACTIVE',
      },
    });

    for (const option of [...SIZES, ...TOPPINGS]) {
      await prisma.productOption.upsert({
        where: {
          productId_name_type: {
            productId: product.id,
            name: option.name,
            type: option.type,
          },
        },
        update: {
          priceAdjustment: option.priceAdjustment,
          isAvailable: true,
        },
        create: {
          optionId: optionId(sequence),
          productId: product.id,
          name: option.name,
          type: option.type,
          priceAdjustment: option.priceAdjustment,
          isAvailable: true,
        },
      });

      sequence += 1;
    }
  }
}

type SeedIngredient = { id: string; name: string; unit: string; stock: number };

/** Kho nguyên liệu mẫu. Đơn vị: g, ml hoặc quả. */
const INGREDIENTS: SeedIngredient[] = [
  { id: '33333333-3333-4333-8333-000000000001', name: 'Cà phê rang xay', unit: 'g', stock: 2000 },
  { id: '33333333-3333-4333-8333-000000000002', name: 'Sữa đặc', unit: 'ml', stock: 3000 },
  { id: '33333333-3333-4333-8333-000000000003', name: 'Sữa tươi', unit: 'ml', stock: 20000 },
  { id: '33333333-3333-4333-8333-000000000004', name: 'Trà đen', unit: 'g', stock: 1500 },
  { id: '33333333-3333-4333-8333-000000000005', name: 'Bột matcha', unit: 'g', stock: 300 },
  { id: '33333333-3333-4333-8333-000000000006', name: 'Trân châu', unit: 'g', stock: 4000 },
  { id: '33333333-3333-4333-8333-000000000007', name: 'Đào ngâm', unit: 'miếng', stock: 150 },
  { id: '33333333-3333-4333-8333-000000000008', name: 'Cam tươi', unit: 'quả', stock: 80 },
  { id: '33333333-3333-4333-8333-000000000009', name: 'Bột cacao', unit: 'g', stock: 1000 },
  { id: '33333333-3333-4333-8333-000000000010', name: 'Trà xanh', unit: 'g', stock: 1000 },
  { id: '33333333-3333-4333-8333-000000000011', name: 'Chanh dây', unit: 'quả', stock: 60 },
  { id: '33333333-3333-4333-8333-000000000012', name: 'Kem cheese', unit: 'g', stock: 2000 },
  { id: '33333333-3333-4333-8333-000000000013', name: 'Sữa chua', unit: 'ml', stock: 4000 },
  { id: '33333333-3333-4333-8333-000000000014', name: 'Thạch trái cây', unit: 'g', stock: 3000 },
];

const ING = (n: number): string => INGREDIENTS[n - 1].id;
const PROD = (n: number): string => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

/** Công thức cho 1 ly size S, không topping (khớp đơn vị của nguyên liệu). */
const RECIPES: Array<{ productId: string; ingredientId: string; quantityPerServing: number }> = [
  // Cà phê sữa đá
  { productId: PROD(1), ingredientId: ING(1), quantityPerServing: 20 },
  { productId: PROD(1), ingredientId: ING(2), quantityPerServing: 30 },
  // Cà phê đen đá
  { productId: PROD(2), ingredientId: ING(1), quantityPerServing: 25 },
  // Bạc xỉu
  { productId: PROD(3), ingredientId: ING(1), quantityPerServing: 10 },
  { productId: PROD(3), ingredientId: ING(2), quantityPerServing: 30 },
  { productId: PROD(3), ingredientId: ING(3), quantityPerServing: 60 },
  // Trà sữa trân châu
  { productId: PROD(4), ingredientId: ING(4), quantityPerServing: 8 },
  { productId: PROD(4), ingredientId: ING(3), quantityPerServing: 100 },
  { productId: PROD(4), ingredientId: ING(6), quantityPerServing: 50 },
  // Trà đào cam sả
  { productId: PROD(5), ingredientId: ING(4), quantityPerServing: 6 },
  { productId: PROD(5), ingredientId: ING(7), quantityPerServing: 2 },
  { productId: PROD(5), ingredientId: ING(8), quantityPerServing: 1 },
  // Matcha latte
  { productId: PROD(6), ingredientId: ING(5), quantityPerServing: 5 },
  { productId: PROD(6), ingredientId: ING(3), quantityPerServing: 150 },
  // Sữa tươi trân châu đường đen
  { productId: PROD(7), ingredientId: ING(3), quantityPerServing: 180 },
  { productId: PROD(7), ingredientId: ING(6), quantityPerServing: 60 },
  // Cacao nóng
  { productId: PROD(8), ingredientId: ING(9), quantityPerServing: 20 },
  { productId: PROD(8), ingredientId: ING(3), quantityPerServing: 150 },
  // Trà xanh chanh dây
  { productId: PROD(9), ingredientId: ING(10), quantityPerServing: 6 },
  { productId: PROD(9), ingredientId: ING(11), quantityPerServing: 1 },
  // Cà phê muối
  { productId: PROD(10), ingredientId: ING(1), quantityPerServing: 20 },
  { productId: PROD(10), ingredientId: ING(3), quantityPerServing: 30 },
  { productId: PROD(10), ingredientId: ING(12), quantityPerServing: 30 },
  // Cold brew cam
  { productId: PROD(11), ingredientId: ING(1), quantityPerServing: 25 },
  { productId: PROD(11), ingredientId: ING(8), quantityPerServing: 1 },
  // Sữa chua cà phê
  { productId: PROD(12), ingredientId: ING(1), quantityPerServing: 15 },
  { productId: PROD(12), ingredientId: ING(13), quantityPerServing: 150 },
];

async function seedIngredients(): Promise<void> {
  for (const ingredient of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { ingredientId: ingredient.id },
      // Chạy lại seed không nạp đầy kho đã tiêu thụ.
      update: { name: ingredient.name, unit: ingredient.unit },
      create: {
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        stock: ingredient.stock,
      },
    });
  }

  for (const recipe of RECIPES) {
    await prisma.productIngredient.upsert({
      where: {
        productId_ingredientId: {
          productId: recipe.productId,
          ingredientId: recipe.ingredientId,
        },
      },
      update: { quantityPerServing: recipe.quantityPerServing },
      create: recipe,
    });
  }
}

async function seedOptionIngredients(): Promise<void> {
  // Size S dùng công thức gốc; M thêm 25%, L thêm 50%.
  const sizeExtras: Record<string, number> = { S: 0, M: 0.25, L: 0.5 };
  const toppings: Record<string, { ingredientId: string; quantityDelta: number }> = {
    'Trân châu': { ingredientId: ING(6), quantityDelta: 30 },
    'Thạch trái cây': { ingredientId: ING(14), quantityDelta: 30 },
    'Kem cheese': { ingredientId: ING(12), quantityDelta: 20 },
  };

  for (const product of PRODUCTS) {
    const recipe = RECIPES.filter((line) => line.productId === product.id);
    const options = await prisma.productOption.findMany({
      where: {
        productId: product.id,
        name: { in: [...SIZES, ...TOPPINGS].map((option) => option.name) },
      },
      select: { optionId: true, name: true, type: true },
    });

    for (const option of options) {
      const extra = sizeExtras[option.name];
      const topping = toppings[option.name];
      const effects =
        option.type === 'SIZE' && extra > 0
          ? recipe.map((line) => ({
              ingredientId: line.ingredientId,
              quantityDelta: Number((line.quantityPerServing * extra).toFixed(3)),
            }))
          : option.type === 'TOPPING' && topping
            ? [topping]
            : [];

      for (const effect of effects) {
        await prisma.productOptionIngredient.upsert({
          where: {
            optionId_ingredientId: {
              optionId: option.optionId,
              ingredientId: effect.ingredientId,
            },
          },
          update: { quantityDelta: effect.quantityDelta },
          create: { optionId: option.optionId, ...effect },
        });
      }
    }
  }
}

async function seedPromotions(): Promise<void> {
  await prisma.promotion.upsert({
    where: {
      code: 'WELCOME10',
    },
    update: {
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscount: 20000,
      minimumOrderAmount: 50000,
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: new Date('2027-12-31T23:59:59.000Z'),
      status: 'ACTIVE',
    },
    create: {
      code: 'WELCOME10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscount: 20000,
      minimumOrderAmount: 50000,
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: new Date('2027-12-31T23:59:59.000Z'),
      status: 'ACTIVE',
    },
  });
}

async function main(): Promise<void> {
  await seedProducts();
  await seedIngredients();
  await seedOptionIngredients();
  await seedPromotions();
  await seedPaymentTestData();

  const [productCount, optionCount, promotionCount, ingredientCount] = await Promise.all([
    prisma.product.count(),
    prisma.productOption.count(),
    prisma.promotion.count(),
    prisma.ingredient.count(),
  ]);

  console.info(
    `Seed hoàn tất: ${productCount} sản phẩm, ${optionCount} tùy chọn, ${promotionCount} khuyến mãi, ${ingredientCount} nguyên liệu.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function seedPaymentTestData(): Promise<void> {
  const testUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const productId = '11111111-1111-4111-8111-000000000001';

  const orders = [
    {
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      orderCode: 'TEST-PAY-001',
    },
    {
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      orderCode: 'TEST-PAY-002',
    },
  ];

  // Tạo user kiểm thử. Không dùng tài khoản này để đăng nhập thật.
  await prisma.user.upsert({
    where: { email: 'payment-test@brewlite.local' },
    update: {},
    create: {
      userId: testUserId,
      username: 'payment-test',
      email: 'payment-test@brewlite.local',
      passwordHash: 'NOT_FOR_LOGIN',
      role: 'CUSTOMER',
      isActive: true,
    },
  });

  const product = await prisma.product.findUnique({
    where: { productId },
  });

  if (!product) {
    throw new Error('Không tìm thấy sản phẩm thử nghiệm. Hãy chạy seedProducts() trước.');
  }

  for (const orderData of orders) {
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: orderData.orderId },
    });

    if (existingOrder) {
      console.info(`Giữ nguyên đơn hàng ${existingOrder.orderCode}`);
      continue;
    }

    const quantity = 1;
    const unitPrice = Number(product.basePrice);
    const subtotal = unitPrice * quantity;

    await prisma.order.create({
      data: {
        orderId: orderData.orderId,
        orderCode: orderData.orderCode,
        userId: testUserId,
        subtotal,
        discountAmount: 0,
        totalAmount: subtotal,
        status: 'PENDING',
        items: {
          create: {
            productId,
            productName: product.name,
            quantity,
            unitPrice,
            subtotal,
          },
        },
      },
    });

    console.info(`Đã tạo đơn hàng ${orderData.orderCode}`);
  }
}
