
/**
 * Luật nguyên liệu thuần logic, không phụ thuộc DB.
 *
 * - Có công thức: tiêu thụ nguyên liệu theo công thức.
 * - Không có công thức: không bị ràng buộc bởi nguyên liệu.
 * - Size: quantityDelta có thể âm, bằng 0 hoặc dương.
 * - Topping: quantityDelta phải dương.
 */

export type RecipeLine = {
  ingredientId: string;
  name: string;
  unit: string;
  quantityPerServing: number;
  stock: number;
};

export type IngredientRequirement = {
  ingredientId: string;
  name: string;
  unit: string;
  need: number;
};

export type OptionEffectLine = {
  optionId: string;
  productId: string;
  type: 'SIZE' | 'TOPPING';
  ingredientId: string;
  name: string;
  unit: string;
  quantityDelta: number;
};

export type OrderIngredientSelection = {
  productId: string;
  quantity: number;
  sizeOptionId?: string;
  toppingOptionIds?: string[];
};

export type InventoryReservation = {
  ingredientRequirements: IngredientRequirement[];
  productStockUsages: Array<{
    productId: string;
    quantity: number;
  }>;
};

// export function maxServings(
//   recipe: readonly RecipeLine[],
// ): number | null {
//   if (recipe.length === 0) return null;

//   return Math.min(
//     ...recipe.map((line) =>
//       Math.floor(
//         Math.max(0, line.stock) / line.quantityPerServing,
//       ),
//     ),
//   );
// }

export function maxServings(
  recipe: readonly RecipeLine[],
): number | null {
  if (recipe.length === 0) return null;

  return Math.min(
    ...recipe.map((line) => {
      // Cùng độ chính xác 3 chữ số thập phân với DB và lúc trừ nguyên liệu.
      const perServingMilli = Math.round(line.quantityPerServing * 1000);
      if (
        !Number.isFinite(line.quantityPerServing) ||
        perServingMilli <= 0 ||
        !Number.isFinite(line.stock)
      ) {
        throw new Error(
          `Công thức nguyên liệu "${line.name}" không hợp lệ.`,
        );
      }

      return Math.floor(
        Math.round(Math.max(0, line.stock) * 1000) / perServingMilli,
      );
    }),
  );
}

export function missingIngredients(
  recipe: readonly RecipeLine[],
): string[] {
  return recipe
    .filter(
      (line) => line.stock < line.quantityPerServing,
    )
    .map((line) => line.name);
}

export function effectiveStock(
  productStock: number,
  recipe: readonly RecipeLine[],
): number {
  return maxServings(recipe) ?? productStock;
}

/**
 * Gom nguyên liệu cần thiết cho toàn bộ đơn hàng.
 *
 * Tính riêng từng dòng đơn hàng trước khi cộng dồn,
 * vì cùng một sản phẩm có thể được chọn Size/Topping khác nhau.
 *
 * Dùng đơn vị milli (x1000) để hạn chế sai số số thực.
 */
// export function aggregateRequirements(
//   items: ReadonlyArray<OrderIngredientSelection>,
//   recipes: ReadonlyMap<string, readonly RecipeLine[]>,
//   effects: ReadonlyMap<string, readonly OptionEffectLine[]>,
// ): IngredientRequirement[] {
//   const totals = new Map<
//     string,
//     {
//       ingredientId: string;
//       name: string;
//       unit: string;
//       needMilli: number;
//     }
//   >();

//   const toMilli = (value: number): number => {
//     if (!Number.isFinite(value)) {
//       throw new Error('Số lượng nguyên liệu không hợp lệ.');
//     }

//     return Math.round(value * 1000);
//   };

//   const addRequirement = (
//     ingredient: {
//       ingredientId: string;
//       name: string;
//       unit: string;
//     },
//     quantityMilli: number,
//   ) => {
//     const current = totals.get(ingredient.ingredientId);

//     if (current) {
//       current.needMilli += quantityMilli;
//     } else {
//       totals.set(ingredient.ingredientId, {
//         ...ingredient,
//         needMilli: quantityMilli,
//       });
//     }
//   };

//   for (const item of items) {
//     if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
//       throw new Error('Số lượng sản phẩm phải là số nguyên dương.');
//     }

//     const recipe = recipes.get(item.productId) ?? [];

//     // Mỗi sản phẩm có công thức sẽ tiêu thụ nguyên liệu.
//     for (const line of recipe) {
//       const baseMilli = toMilli(line.quantityPerServing);

//       if (baseMilli <= 0) {
//         throw new Error(
//           `Công thức nguyên liệu "${line.name}" không hợp lệ.`,
//         );
//       }

//       addRequirement(
//         {
//           ingredientId: line.ingredientId,
//           name: line.name,
//           unit: line.unit,
//         },
//         baseMilli * item.quantity,
//       );
//     }

//     // Size: có thể làm tăng hoặc giảm lượng nguyên liệu.
//     if (item.sizeOptionId) {
//       const sizeEffects = effects.get(item.sizeOptionId) ?? [];

//       for (const effect of sizeEffects) {
//         if (
//           effect.productId !== item.productId ||
//           effect.type !== 'SIZE'
//         ) {
//           throw new Error('Tùy chọn Size không hợp lệ.');
//         }

//         addRequirement(
//           {
//             ingredientId: effect.ingredientId,
//             name: effect.name,
//             unit: effect.unit,
//           },
//           toMilli(effect.quantityDelta) * item.quantity,
//         );
//       }
//     }

//     // Topping: phải có hiệu ứng nguyên liệu và số lượng dương.
//     const toppingIds = item.toppingOptionIds ?? [];

//     if (new Set(toppingIds).size !== toppingIds.length) {
//       throw new Error('Không được chọn trùng Topping.');
//     }

//     for (const toppingId of toppingIds) {
//       const toppingEffects = effects.get(toppingId) ?? [];

//       if (toppingEffects.length === 0) {
//         throw new Error(
//           'Topping chưa được cấu hình công thức nguyên liệu.',
//         );
//       }

//       for (const effect of toppingEffects) {
//         if (
//           effect.productId !== item.productId ||
//           effect.type !== 'TOPPING'
//         ) {
//           throw new Error('Tùy chọn Topping không hợp lệ.');
//         }

//         const deltaMilli = toMilli(effect.quantityDelta);

//         if (deltaMilli <= 0) {
//           throw new Error(
//             'Lượng nguyên liệu bổ sung của Topping phải lớn hơn 0.',
//           );
//         }

//         addRequirement(
//           {
//             ingredientId: effect.ingredientId,
//             name: effect.name,
//             unit: effect.unit,
//           },
//           deltaMilli * item.quantity,
//         );
//       }
//     }
//   }

//   return [...totals.values()]
//     .filter((item) => item.needMilli > 0)
//     .map((item) => ({
//       ingredientId: item.ingredientId,
//       name: item.name,
//       unit: item.unit,
//       need: item.needMilli / 1000,
//     }))
//     .sort((a, b) =>
//       a.ingredientId.localeCompare(b.ingredientId),
//     );
// }

export function aggregateRequirements(
  items: ReadonlyArray<OrderIngredientSelection>,
  recipes: ReadonlyMap<string, readonly RecipeLine[]>,
  effects: ReadonlyMap<string, readonly OptionEffectLine[]> = new Map(),
): IngredientRequirement[] {
  const totals = new Map<
    string,
    {
      ingredientId: string;
      name: string;
      unit: string;
      needMilli: number;
    }
  >();

  const toMilli = (value: number): number => {
    if (!Number.isFinite(value)) {
      throw new Error('Số lượng nguyên liệu không hợp lệ.');
    }

    return Math.round(value * 1000);
  };

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Số lượng sản phẩm phải là số nguyên dương.');
    }

    const recipe = recipes.get(item.productId) ?? [];

    // Không có công thức: chỉ quản lý bằng Product.stock.
    if (recipe.length === 0) continue;

    // Tính lượng tiêu thụ ròng theo từng nguyên liệu.
    const lineRequirements = new Map<
      string,
      {
        ingredientId: string;
        name: string;
        unit: string;
        needMilli: number;
      }
    >();

    const addLineRequirement = (
      ingredient: {
        ingredientId: string;
        name: string;
        unit: string;
      },
      quantityMilli: number,
    ) => {
      const current = lineRequirements.get(ingredient.ingredientId);

      if (current) {
        current.needMilli += quantityMilli;
      } else {
        lineRequirements.set(ingredient.ingredientId, {
          ...ingredient,
          needMilli: quantityMilli,
        });
      }
    };

    // Nguyên liệu gốc.
    for (const line of recipe) {
      const baseMilli = toMilli(line.quantityPerServing);

      if (baseMilli <= 0) {
        throw new Error(
          `Công thức nguyên liệu "${line.name}" không hợp lệ.`,
        );
      }

      addLineRequirement(
        {
          ingredientId: line.ingredientId,
          name: line.name,
          unit: line.unit,
        },
        baseMilli,
      );
    }

    // Hiệu ứng Size.
    if (item.sizeOptionId) {
      const sizeEffects = effects.get(item.sizeOptionId) ?? [];

      for (const effect of sizeEffects) {
        if (
          effect.productId !== item.productId ||
          effect.type !== 'SIZE'
        ) {
          throw new Error('Tùy chọn Size không hợp lệ.');
        }

        addLineRequirement(
          {
            ingredientId: effect.ingredientId,
            name: effect.name,
            unit: effect.unit,
          },
          toMilli(effect.quantityDelta),
        );
      }
    }

    // Hiệu ứng Topping.
    const toppingIds = item.toppingOptionIds ?? [];

    if (new Set(toppingIds).size !== toppingIds.length) {
      throw new Error('Không được chọn trùng Topping.');
    }

    for (const toppingId of toppingIds) {
      const toppingEffects = effects.get(toppingId) ?? [];

      if (toppingEffects.length === 0) {
        throw new Error(
          'Topping chưa được cấu hình công thức nguyên liệu.',
        );
      }

      for (const effect of toppingEffects) {
        if (
          effect.productId !== item.productId ||
          effect.type !== 'TOPPING'
        ) {
          throw new Error('Tùy chọn Topping không hợp lệ.');
        }

        const deltaMilli = toMilli(effect.quantityDelta);

        if (deltaMilli <= 0) {
          throw new Error(
            'Lượng nguyên liệu bổ sung của Topping phải lớn hơn 0.',
          );
        }

        addLineRequirement(
          {
            ingredientId: effect.ingredientId,
            name: effect.name,
            unit: effect.unit,
          },
          deltaMilli,
        );
      }
    }

    // Kiểm tra lượng tiêu thụ ròng trước khi cộng vào toàn đơn.
    for (const requirement of lineRequirements.values()) {
      if (requirement.needMilli < 0) {
        throw new Error(
          `Lượng nguyên liệu "${requirement.name}" sau khi áp dụng Size không được âm.`,
        );
      }

      // Nhân số lượng đặt rồi mới cộng dồn toàn đơn.
      const current = totals.get(requirement.ingredientId);

      const totalNeed =
        requirement.needMilli * item.quantity;

      if (current) {
        current.needMilli += totalNeed;
      } else {
        totals.set(requirement.ingredientId, {
          ingredientId: requirement.ingredientId,
          name: requirement.name,
          unit: requirement.unit,
          needMilli: totalNeed,
        });
      }
    }
  }

  return [...totals.values()]
    .filter((item) => item.needMilli > 0)
    .map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      unit: item.unit,
      need: item.needMilli / 1000,
    }))
    .sort((a, b) =>
      a.ingredientId.localeCompare(b.ingredientId),
    );
}
