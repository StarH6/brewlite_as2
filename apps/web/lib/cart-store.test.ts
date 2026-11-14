/**
 * Test suite for Cart Store and Cart Business Logic:
 * - Thêm sản phẩm (cùng size/topping vs khác size/topping)
 * - Sửa số lượng (tăng, giảm, clamp 1-20, về 0 thì xóa)
 * - Xóa món (từng món, xóa tất cả)
 * - Tự động tính tổng tiền (unit price, item total, cart subtotal)
 * - Header badge count
 * - Persist localStorage & F5 rehydration
 */

import type { CartSelection, Product, ProductOption } from './types';

// Giả lập localStorage cho môi trường kiểm thử
const storageMap = new Map<string, string>();
const mockLocalStorage: Storage = {
  length: 0,
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, value);
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
};

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: mockLocalStorage,
  },
  writable: true,
});

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('--- BẮT ĐẦU KIỂM THỬ GIỎ HÀNG (BREWLITE CART) ---');

  // Dynamic import để đảm bảo window.localStorage đã sẵn sàng
  const {
    useCartStore,
    selectCartCount,
    calculateCartSubtotal,
    resolveCartItems,
    MAX_ITEM_QUANTITY,
  } = await import('./cart-store');

  // Dữ liệu mẫu
  const mockProductA: Product = {
    id: 'prod-1',
    name: 'Cà phê Sữa Đá',
    description: 'Cà phê pha phin truyền thống',
    price: 35000,
    imageUrl: '/images/coffee.jpg',
    stock: 50,
    status: 'ACTIVE',
    options: [],
  };

  const mockProductB: Product = {
    id: 'prod-2',
    name: 'Trà Đào Cam Sả',
    description: 'Trà đào thanh mát',
    price: 45000,
    imageUrl: '/images/tea.jpg',
    stock: 30,
    status: 'ACTIVE',
    options: [],
  };

  const sizeM: ProductOption = {
    id: 'size-m',
    name: 'M',
    type: 'SIZE',
    priceAdjustment: 5000,
    isAvailable: true,
  };

  const sizeL: ProductOption = {
    id: 'size-l',
    name: 'L',
    type: 'SIZE',
    priceAdjustment: 10000,
    isAvailable: true,
  };

  const toppingTranChau: ProductOption = {
    id: 'top-1',
    name: 'Trân châu trắng',
    type: 'TOPPING',
    priceAdjustment: 8000,
    isAvailable: true,
  };

  const toppingThachNhaDam: ProductOption = {
    id: 'top-2',
    name: 'Thạch nha đam',
    type: 'TOPPING',
    priceAdjustment: 7000,
    isAvailable: true,
  };

  // The store persists IDs only; names/prices must be resolved from Product API data.
  const products = [
    { ...mockProductA, options: [sizeM, sizeL, toppingTranChau, toppingThachNhaDam] },
    mockProductB,
  ];
  const resolveItems = (state: { items: CartSelection[] }) =>
    resolveCartItems(state.items, products);
  const selectCartSubtotal = (state: { items: CartSelection[] }) =>
    calculateCartSubtotal(resolveItems(state));

  // 1. Giỏ hàng ban đầu phải rỗng
  useCartStore.getState().clear();
  assert(useCartStore.getState().items.length === 0, 'Giỏ hàng khởi tạo trống');
  assert(
    selectCartCount(useCartStore.getState()) === 0,
    'Badge số lượng ban đầu là 0',
  );
  assert(
    selectCartSubtotal(useCartStore.getState()) === 0,
    'Tổng tiền ban đầu là 0',
  );

  // 2. Thêm món mới vào giỏ hàng
  // Món A: giá 35k + size M (5k) + trân châu (8k) = 48k. Số lượng 2 -> 96k
  useCartStore.getState().addItem(mockProductA, sizeM, [toppingTranChau], 2);
  let state = useCartStore.getState();
  assert(state.items.length === 1, 'Đã thêm 1 loại sản phẩm vào giỏ');
  assert(resolveItems(state)[0].productName === 'Cà phê Sữa Đá', 'Tên sản phẩm đúng');
  assert(state.items[0].quantity === 2, 'Số lượng đúng là 2');
  assert(
    resolveItems(state)[0].unitPrice === 48000,
    'Đơn giá tính đúng (35k + 5k + 8k = 48k)',
  );
  assert(
    selectCartCount(state) === 2,
    'Badge số lượng header hiển thị đúng: 2',
  );
  assert(
    selectCartSubtotal(state) === 96000,
    'Tự tính tổng tiền đúng: 48k * 2 = 96.000đ',
  );

  // 3. Thêm cùng món A với CÙNG options -> phải cộng dồn số lượng
  useCartStore.getState().addItem(mockProductA, sizeM, [toppingTranChau], 3);
  state = useCartStore.getState();
  assert(
    state.items.length === 1,
    'Không tạo dòng mới khi cùng options, vẫn là 1 dòng',
  );
  assert(
    state.items[0].quantity === 5,
    'Số lượng cộng dồn thành công: 2 + 3 = 5',
  );
  assert(selectCartCount(state) === 5, 'Badge số lượng header cập nhật: 5');
  assert(
    selectCartSubtotal(state) === 240000,
    'Tự tính tổng tiền cập nhật đúng: 48k * 5 = 240.000đ',
  );

  // 4. Thêm món A nhưng KHÁC options (Size L, 2 toppings) -> phải tạo item mới
  // Món A: giá 35k + size L (10k) + 2 toppings (8k + 7k) = 60k. Số lượng 1 -> 60k
  useCartStore
    .getState()
    .addItem(
      mockProductA,
      sizeL,
      [toppingTranChau, toppingThachNhaDam],
      1,
    );
  state = useCartStore.getState();
  assert(
    state.items.length === 2,
    'Tạo dòng sản phẩm mới khi tùy chọn size/topping khác',
  );
  assert(
    resolveItems(state)[1].unitPrice === 60000,
    'Đơn giá dòng thứ 2 đúng: 35k + 10k + 8k + 7k = 60k',
  );
  assert(
    selectCartCount(state) === 6,
    'Badge số lượng header cập nhật: 5 + 1 = 6',
  );
  assert(
    selectCartSubtotal(state) === 300000,
    'Tự tính tổng tiền cập nhật: 240k + 60k = 300.000đ',
  );

  // 5. Thêm món B (Trà đào) -> tạo item thứ 3
  // Giá 45k, không size, không topping. Số lượng 1 -> 45k
  useCartStore.getState().addItem(mockProductB, null, [], 1);
  state = useCartStore.getState();
  assert(state.items.length === 3, 'Giỏ hàng có 3 dòng sản phẩm');
  assert(selectCartCount(state) === 7, 'Badge header: 7');
  assert(
    selectCartSubtotal(state) === 345000,
    'Tổng tiền: 300k + 45k = 345.000đ',
  );

  // 6. Sửa số lượng (updateQuantity)
  const item1Key = state.items[0].key;
  // Tăng số lượng dòng 1 từ 5 lên 7
  useCartStore.getState().updateQuantity(item1Key, 7);
  state = useCartStore.getState();
  assert(state.items[0].quantity === 7, 'Sửa số lượng thành 7 thành công');
  assert(selectCartCount(state) === 9, 'Badge header cập nhật: 7 + 1 + 1 = 9');
  assert(
    selectCartSubtotal(state) === 48000 * 7 + 60000 + 45000,
    'Tổng tiền tự động tính lại chính xác: 441.000đ',
  );

  // Giảm số lượng dòng 1 từ 7 xuống 1
  useCartStore.getState().updateQuantity(item1Key, 1);
  state = useCartStore.getState();
  assert(state.items[0].quantity === 1, 'Giảm số lượng thành 1 thành công');
  assert(selectCartCount(state) === 3, 'Badge header cập nhật: 1 + 1 + 1 = 3');
  assert(
    selectCartSubtotal(state) === 48000 * 1 + 60000 + 45000,
    'Tổng tiền tự động tính lại chính xác: 153.000đ',
  );

  // Giới hạn MAX_ITEM_QUANTITY (20)
  useCartStore.getState().updateQuantity(item1Key, 999);
  state = useCartStore.getState();
  assert(
    state.items[0].quantity === MAX_ITEM_QUANTITY,
    `Số lượng được clamp đúng ở mức tối đa ${MAX_ITEM_QUANTITY}`,
  );

  // Giảm số lượng về 0 -> tự động xóa món khỏi giỏ
  useCartStore.getState().updateQuantity(item1Key, 0);
  state = useCartStore.getState();
  assert(
    state.items.length === 2,
    'Giảm số lượng về 0 tự động xóa món khỏi giỏ',
  );
  assert(!state.items.some((i) => i.key === item1Key), 'Item 1 không còn tồn tại');

  // 7. Xóa món trực tiếp bằng removeItem
  const item2Key = state.items[0].key;
  useCartStore.getState().removeItem(item2Key);
  state = useCartStore.getState();
  assert(state.items.length === 1, 'Đã xóa item 2, còn lại 1 item');
  assert(state.items[0].productId === 'prod-2', 'Chỉ còn lại Trà Đào');
  assert(selectCartCount(state) === 1, 'Badge header: 1');
  assert(selectCartSubtotal(state) === 45000, 'Tổng tiền: 45.000đ');

  // 8. Kiểm tra localStorage được đồng bộ
  const savedStorage = mockLocalStorage.getItem('brewlite-cart');
  assert(
    savedStorage !== null,
    'Dữ liệu giỏ hàng đã được lưu vào localStorage',
  );
  const parsedStorage = JSON.parse(savedStorage!) as {
    state: { items: CartSelection[] };
  };
  assert(parsedStorage.state.items.length === 1, 'localStorage chứa 1 item');
  assert(
    parsedStorage.state.items[0].productId === 'prod-2',
    'localStorage lưu đúng ID sản phẩm, không lưu tên/giá cũ',
  );

  // 9. Giả lập F5 (tải lại trang / rehydrate từ localStorage)
  console.log(
    '\n--- GIẢ LẬP F5 (PAGE RELOAD & REHYDRATION TỪ LOCALSTORAGE) ---',
  );
  // Thêm lại món A trước khi F5
  useCartStore.getState().addItem(mockProductA, sizeM, [toppingTranChau], 2);
  const rawJsonBefore = mockLocalStorage.getItem('brewlite-cart');

  // Sau khi F5, kiểm tra dữ liệu đọc lại từ localStorage
  const rehydratedState = (
    JSON.parse(rawJsonBefore!) as { state: { items: CartSelection[] } }
  ).state;
  const rehydratedItems = resolveItems(rehydratedState);
  assert(
    rehydratedState.items.length === 2,
    'Sau khi F5: localStorage phục hồi đủ 2 dòng món',
  );
  assert(
    rehydratedItems[0].productName === 'Trà Đào Cam Sả',
    'Món 1 sau F5 giữ nguyên',
  );
  assert(
    rehydratedItems[1].productName === 'Cà phê Sữa Đá',
    'Món 2 sau F5 giữ nguyên',
  );
  assert(
    rehydratedItems[1].size?.name === 'M',
    'Tùy chọn Size sau F5 giữ nguyên',
  );
  assert(
    rehydratedItems[1].toppings[0].name === 'Trân châu trắng',
    'Topping sau F5 giữ nguyên',
  );
  assert(
    rehydratedState.items[1].quantity === 2,
    'Số lượng sau F5 giữ nguyên',
  );
  const rehydratedTotal = selectCartSubtotal(rehydratedState);
  assert(
    rehydratedTotal === 45000 + 48000 * 2,
    'Tổng tiền tính từ dữ liệu phục hồi sau F5 khớp 100%',
  );

  // 10. Xóa tất cả (clear)
  useCartStore.getState().clear();
  state = useCartStore.getState();
  assert(state.items.length === 0, 'Clear xóa toàn bộ món trong giỏ');
  assert(selectCartCount(state) === 0, 'Badge header về 0');
  assert(selectCartSubtotal(state) === 0, 'Tổng tiền về 0');

  const emptyStorage = JSON.parse(
    mockLocalStorage.getItem('brewlite-cart')!,
  ) as { state: { items: CartSelection[] } };
  assert(
    emptyStorage.state.items.length === 0,
    'localStorage cũng được xóa sạch',
  );

  console.log('\n🎉 TẤT CẢ CÁC BÀI TEST GIỎ HÀNG ĐỀU ĐẠT CHUẨN 100%!');
}

runTests().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
