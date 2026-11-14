import {
  aggregateRequirements,
  effectiveStock,
  maxServings,
  missingIngredients,
  type OptionEffectLine,
  type RecipeLine,
} from './ingredient-policy';

const milk = (stock: number, perServing = 150): RecipeLine => ({
  ingredientId: 'ing-milk',
  name: 'Sữa tươi',
  unit: 'ml',
  quantityPerServing: perServing,
  stock,
});

const matcha = (stock: number): RecipeLine => ({
  ingredientId: 'ing-matcha',
  name: 'Bột matcha',
  unit: 'g',
  quantityPerServing: 5,
  stock,
});

describe('ingredient-policy', () => {
  describe('maxServings', () => {
    it('món không có công thức thì không bị giới hạn (null)', () => {
      expect(maxServings([])).toBeNull();
    });

    it('lấy nguyên liệu cạn nhất làm chuẩn', () => {
      expect(maxServings([milk(600), matcha(10)])).toBe(2);
    });

    it('trả 0 khi một nguyên liệu không đủ cho 1 phần', () => {
      expect(maxServings([milk(149), matcha(100)])).toBe(0);
    });

    it('tồn kho âm vẫn coi là 0', () => {
      expect(maxServings([milk(-5)])).toBe(0);
    });

    it('không làm mất một phần do sai số chia số thập phân', () => {
      expect(maxServings([milk(0.3, 0.1)])).toBe(3);
      expect(maxServings([milk(0.299, 0.1)])).toBe(2);
    });

    it('từ chối công thức có định lượng bằng 0', () => {
      expect(() => maxServings([milk(100, 0)])).toThrow(
        'Công thức nguyên liệu "Sữa tươi" không hợp lệ.',
      );
    });
  });

  describe('missingIngredients', () => {
    it('chỉ liệt kê nguyên liệu không đủ cho 1 phần', () => {
      expect(missingIngredients([milk(100), matcha(50)])).toEqual([
        'Sữa tươi',
      ]);
    });

    it('đủ hết thì danh sách rỗng', () => {
      expect(missingIngredients([milk(150), matcha(5)])).toEqual([]);
    });

    it('hết hẳn một nguyên liệu vẫn bị liệt kê', () => {
      expect(missingIngredients([milk(0)])).toEqual(['Sữa tươi']);
    });
  });

  describe('effectiveStock', () => {
    it('không có công thức thì bằng tồn kho món', () => {
      expect(effectiveStock(30, [])).toBe(30);
    });

    it('sản phẩm có công thức chỉ phụ thuộc vào tồn kho nguyên liệu', () => {
      expect(effectiveStock(30, [milk(600)])).toBe(4);
      expect(effectiveStock(3, [milk(6000)])).toBe(40);
    });

    it('nguyên liệu hết thì bán được 0 dù món còn kho', () => {
      expect(effectiveStock(30, [milk(0)])).toBe(0);
    });
  });

  describe('aggregateRequirements', () => {
    const recipes = new Map<string, RecipeLine[]>([
      ['p-matcha', [milk(1000), matcha(100)]],
      ['p-latte', [milk(1000, 200)]],
    ]);

    it('nhân công thức với số lượng đặt', () => {
      const result = aggregateRequirements([
        { productId: 'p-matcha', quantity: 2 },
      ], recipes);

      expect(result).toEqual([
        { ingredientId: 'ing-matcha', name: 'Bột matcha', unit: 'g', need: 10 },
        { ingredientId: 'ing-milk', name: 'Sữa tươi', unit: 'ml', need: 300 },
      ]);
    });

    it('cộng dồn nguyên liệu dùng chung giữa các món', () => {
      const result = aggregateRequirements(
        [
          { productId: 'p-matcha', quantity: 1 },
          { productId: 'p-latte', quantity: 2 },
        ],
        recipes,
      );

      expect(result.find((r) => r.ingredientId === 'ing-milk')?.need).toBe(550);
    });

    it('món không có công thức thì không sinh yêu cầu nguyên liệu', () => {
      expect(
        aggregateRequirements([
          { productId: 'p-khong-cong-thuc', quantity: 5 },
        ], recipes),
      ).toEqual([]);
    });

    it('sắp xếp theo ingredientId', () => {
      const ids = aggregateRequirements([
        { productId: 'p-matcha', quantity: 1 },
      ], recipes).map((r) => r.ingredientId);

      expect(ids).toEqual([...ids].sort());
    });

    it('Size giảm lượng nguyên liệu tiêu thụ', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['size-small', [{
          optionId: 'size-small',
          productId: 'p-matcha',
          type: 'SIZE',
          ingredientId: 'ing-milk',
          name: 'Sữa tươi',
          unit: 'ml',
          quantityDelta: -50,
        }]],
      ]);

      const result = aggregateRequirements(
        [{
          productId: 'p-matcha',
          quantity: 2,
          sizeOptionId: 'size-small',
        }],
        recipes,
        effects,
      );

      expect(result.find((r) => r.ingredientId === 'ing-milk')?.need).toBe(200);
    });

    it('Topping làm tăng lượng nguyên liệu tiêu thụ', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['topping-matcha', [{
          optionId: 'topping-matcha',
          productId: 'p-matcha',
          type: 'TOPPING',
          ingredientId: 'ing-matcha',
          name: 'Bột matcha',
          unit: 'g',
          quantityDelta: 2,
        }]],
      ]);

      const result = aggregateRequirements(
        [{
          productId: 'p-matcha',
          quantity: 2,
          toppingOptionIds: ['topping-matcha'],
        }],
        recipes,
        effects,
      );

      expect(result.find((r) => r.ingredientId === 'ing-matcha')?.need).toBe(14);
    });

    it('cùng món khác Size/Topping phải trừ đúng từng dòng rồi cộng nguyên liệu chung', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['size-large', [{
          optionId: 'size-large',
          productId: 'p-matcha',
          type: 'SIZE',
          ingredientId: 'ing-milk',
          name: 'Sữa tươi',
          unit: 'ml',
          quantityDelta: 75,
        }, {
          optionId: 'size-large',
          productId: 'p-matcha',
          type: 'SIZE',
          ingredientId: 'ing-matcha',
          name: 'Bột matcha',
          unit: 'g',
          quantityDelta: 2.5,
        }]],
        ['topping-cheese', [{
          optionId: 'topping-cheese',
          productId: 'p-matcha',
          type: 'TOPPING',
          ingredientId: 'ing-cheese',
          name: 'Kem cheese',
          unit: 'g',
          quantityDelta: 20,
        }]],
      ]);

      const result = aggregateRequirements([
        { productId: 'p-matcha', quantity: 1 },
        {
          productId: 'p-matcha',
          quantity: 2,
          sizeOptionId: 'size-large',
          toppingOptionIds: ['topping-cheese'],
        },
      ], recipes, effects);

      expect(result).toEqual([
        { ingredientId: 'ing-cheese', name: 'Kem cheese', unit: 'g', need: 40 },
        { ingredientId: 'ing-matcha', name: 'Bột matcha', unit: 'g', need: 20 },
        { ingredientId: 'ing-milk', name: 'Sữa tươi', unit: 'ml', need: 600 },
      ]);
    });

    it('từ chối Size làm lượng tiêu thụ nguyên liệu bị âm', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['size-large', [{
          optionId: 'size-large',
          productId: 'p-matcha',
          type: 'SIZE',
          ingredientId: 'ing-milk',
          name: 'Sữa tươi',
          unit: 'ml',
          quantityDelta: -200,
        }]],
      ]);

      expect(() => aggregateRequirements(
        [{
          productId: 'p-matcha',
          quantity: 1,
          sizeOptionId: 'size-large',
        }],
        recipes,
        effects,
      )).toThrow('không được âm');
    });

    it('không cho phép lượng tiêu thụ âm của một món được bù bởi món khác', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['size-small', [{
          optionId: 'size-small',
          productId: 'p-matcha',
          type: 'SIZE',
          ingredientId: 'ing-milk',
          name: 'Sữa tươi',
          unit: 'ml',
          quantityDelta: -200,
        }]],
      ]);

      expect(() => aggregateRequirements(
        [
          {
            productId: 'p-matcha',
            quantity: 1,
            sizeOptionId: 'size-small',
          },
          {
            productId: 'p-latte',
            quantity: 1,
          },
        ],
        recipes,
        effects,
      )).toThrow('không được âm');
    });

    it('từ chối Topping có lượng nguyên liệu không dương', () => {
      const effects = new Map<string, OptionEffectLine[]>([
        ['topping-invalid', [{
          optionId: 'topping-invalid',
          productId: 'p-matcha',
          type: 'TOPPING',
          ingredientId: 'ing-matcha',
          name: 'Bột matcha',
          unit: 'g',
          quantityDelta: 0,
        }]],
      ]);

      expect(() => aggregateRequirements(
        [{
          productId: 'p-matcha',
          quantity: 1,
          toppingOptionIds: ['topping-invalid'],
        }],
        recipes,
        effects,
      )).toThrow('phải lớn hơn 0');
    });
  });
});
