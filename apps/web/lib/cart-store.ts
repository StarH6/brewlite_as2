import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CartItem,
  CartSelection,
  Product,
  ProductOption,
} from './types';

export const MAX_ITEM_QUANTITY = 20;

type CartState = {
  items: CartSelection[];
  hasHydrated: boolean;
  addItem: (
    product: Product,
    size: ProductOption | null,
    toppings: ProductOption[],
    quantity?: number,
  ) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
};

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

function createCartKey(
  productId: string,
  sizeOptionId: string | null,
  toppingOptionIds: string[],
): string {
  return [
    productId,
    sizeOptionId ?? 'no-size',
    ...[...toppingOptionIds].sort(),
  ].join(':');
}

function calculateUnitPrice(
  product: Product,
  size: ProductOption | null,
  toppings: ProductOption[],
): number {
  return (
    product.price +
    (size?.priceAdjustment ?? 0) +
    toppings.reduce((sum, topping) => sum + topping.priceAdjustment, 0)
  );
}

/**
 * Dựng dữ liệu hiển thị từ lựa chọn trong giỏ và dữ liệu Product API.
 * Không sử dụng thông tin sản phẩm cũ được lưu trong localStorage.
 */
export function resolveCartItems(
  selections: CartSelection[],
  products: Product[],
): CartItem[] {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return selections.map((selection) => {
    const product = productMap.get(selection.productId);

    if (!product) {
      return {
        key: selection.key,
        productId: selection.productId,
        productName: 'Sản phẩm không còn khả dụng',
        imageUrl: '',
        size: null,
        toppings: [],
        quantity: selection.quantity,
        unitPrice: 0,
        sizeOptionId: selection.sizeOptionId,
        toppingOptionIds: selection.toppingOptionIds,
        productAvailable: false,
        missingOptionIds: [
          ...(selection.sizeOptionId ? [selection.sizeOptionId] : []),
          ...selection.toppingOptionIds,
        ],
      };
    }

    const optionMap = new Map(
      product.options.map((option) => [option.id, option]),
    );

    const size = selection.sizeOptionId
      ? optionMap.get(selection.sizeOptionId) ?? null
      : null;

    const toppings = selection.toppingOptionIds
      .map((id) => optionMap.get(id))
      .filter((option): option is ProductOption => option !== undefined);

    const missingOptionIds = [
      ...(selection.sizeOptionId && !size ? [selection.sizeOptionId] : []),
      ...selection.toppingOptionIds.filter((id) => !optionMap.has(id)),
    ];

    const allOptionsAvailable =
      (!size || size.isAvailable) &&
      toppings.length === selection.toppingOptionIds.length &&
      toppings.every((topping) => topping.isAvailable);

    return {
      key: selection.key,
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      size,
      toppings,
      quantity: selection.quantity,
      unitPrice: calculateUnitPrice(product, size, toppings),
      sizeOptionId: selection.sizeOptionId,
      toppingOptionIds: selection.toppingOptionIds,
      productAvailable: product.status === 'ACTIVE',
      missingOptionIds: [
        ...missingOptionIds,
        ...(!allOptionsAvailable
          ? [
              ...(!size || size.isAvailable
                ? []
                : [size.id]),
              ...toppings
                .filter((topping) => !topping.isAvailable)
                .map((topping) => topping.id),
            ]
          : []),
      ],
    };
  });
}

/**
 * Tính tạm tính từ CartItem đã được resolve bằng dữ liệu Product API.
 */
export function calculateCartSubtotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,

      addItem: (product, size, toppings, quantity = 1) =>
        set((state) => {
          const toppingOptionIds = toppings.map((topping) => topping.id);
          const sizeOptionId = size?.id ?? null;
          const key = createCartKey(
            product.id,
            sizeOptionId,
            toppingOptionIds,
          );
          const safeQuantity = clampQuantity(quantity);
          const existing = state.items.find((item) => item.key === key);

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.key === key
                  ? {
                      ...item,
                      quantity: Math.min(
                        MAX_ITEM_QUANTITY,
                        item.quantity + safeQuantity,
                      ),
                    }
                  : item,
              ),
            };
          }

          const newSelection: CartSelection = {
            key,
            productId: product.id,
            sizeOptionId,
            toppingOptionIds,
            quantity: safeQuantity,
          };

          return {
            items: [...state.items, newSelection],
          };
        }),

      updateQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.key !== key)
              : state.items.map((item) =>
                  item.key === key
                    ? { ...item, quantity: clampQuantity(quantity) }
                    : item,
                ),
        })),

      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((item) => item.key !== key),
        })),

      clear: () => set({ items: [] }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'brewlite-cart',
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }

        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({ items: state.items }),

      // Chuyển dữ liệu giỏ hàng cũ (CartItem) sang CartSelection.
      migrate: (persistedState: unknown) => {
        const oldState = persistedState as {
          items?: Array<{
            key?: string;
            productId?: string;
            size?: ProductOption | null;
            toppings?: ProductOption[];
            quantity?: number;
          }>;
        };

        const items: CartSelection[] = (oldState.items ?? [])
          .filter((item) => Boolean(item.productId))
          .map((item) => {
            const sizeOptionId = item.size?.id ?? null;
            const toppingOptionIds = (item.toppings ?? []).map(
              (topping) => topping.id,
            );

            return {
              key:
                item.key ??
                createCartKey(
                  item.productId!,
                  sizeOptionId,
                  toppingOptionIds,
                ),
              productId: item.productId!,
              sizeOptionId,
              toppingOptionIds,
              quantity: clampQuantity(item.quantity ?? 1),
            };
          });

        return { items };
      },

      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export const selectCartCount = (state: CartState): number =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);

/**
 * Kiểm tra store đã hydrate trên client chưa.
 * Tránh hydration mismatch giữa SSR và dữ liệu localStorage.
 */
export function useCartHydrated(): boolean {
  const [mounted, setMounted] = useState(false);
  const storeHydrated = useCartStore((state) => state.hasHydrated);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    mounted &&
    (storeHydrated ||
      (typeof useCartStore.persist !== 'undefined' &&
        useCartStore.persist.hasHydrated()))
  );
}