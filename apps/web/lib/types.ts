
export type OptionType = 'SIZE' | 'TOPPING';

export type ProductOption = {
  id: string;
  name: string;
  type: OptionType;
  priceAdjustment: number;
  isAvailable: boolean;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  /** Số phần bán được thực tế, đã tính cả nguyên liệu. */
  stock: number;
  /** Nguyên liệu đang thiếu khiến món không bán được. */
  missingIngredients?: string[];
  status: 'ACTIVE' | 'HIDDEN';
  options: ProductOption[];
};

/** Dữ liệu lựa chọn được lưu trong localStorage. */
export type CartSelection = {
  key: string;
  productId: string;
  sizeOptionId: string | null;
  toppingOptionIds: string[];
  quantity: number;
};

/** Dữ liệu giỏ hàng đã được đối chiếu với Product API. */
export type CartItem = {
  key: string;
  productId: string;
  productName: string;
  imageUrl: string;
  size: ProductOption | null;
  toppings: ProductOption[];
  quantity: number;
  unitPrice: number;

  // ID lựa chọn gốc, kể cả khi option không còn tồn tại.
  sizeOptionId: string | null;
  toppingOptionIds: string[];

  // Trạng thái sản phẩm và option sau khi đối chiếu API.
  productAvailable: boolean;
  missingOptionIds: string[];
};

export type UserRole = 'CUSTOMER' | 'STAFF';

export type User = {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
  loyaltyPoints?: number;
};

export type AuthResponse = {
  accessToken: string;
  tokenType?: string;
  user: User;
};

export type OrderItemOption = {
  id: string;
  orderItemId: string;
  optionName: string;
  optionType: OptionType;
  priceAdjustment: number | string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | string;
  subtotal: number | string;
  options?: OrderItemOption[];
  imageUrl?: string | null;
};

export type Order = {
  id: string;
  orderCode: string;
  userId: string;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  status: string;
  createdAt: string;
  paymentDeadline?: string | null;
  cancelReason?: 'CUSTOMER' | 'STAFF' | 'SYSTEM_EXPIRED' | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  items?: OrderItem[];
};

export type PaymentMethod = 'WALLET' | 'CARD';

export type Payment = {
  paymentId: string;
  orderId: string;
  userId: string;
  idempotencyKey: string;
  amount: number | string;
  method: PaymentMethod;
  status: 'INITIATED' | 'PAID' | 'FAILED';
  transactionReference: string | null;
  provider?: 'mock' | 'vnpay';
  paymentUrl?: string | null;
  expiresAt?: string | null;
  responseCode?: string | null;
  refundRequired?: boolean;
  createdAt?: string;
};

export type PaymentResponse = {
  payment: Payment;
  orderStatus: string;
  reused: boolean;
  requiresRedirect?: boolean;
  paymentUrl?: string | null;
};

export type PaymentOrderStatus = {
  orderId: string;
  orderCode: string;
  orderStatus: string;
  payment: Payment | null;
};

