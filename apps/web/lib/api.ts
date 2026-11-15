import { getStoredToken } from './auth-store';
import type {
  AuthResponse,
  OptionType,
  Order,
  PaymentMethod,
  PaymentResponse,
  PaymentOrderStatus,
  Product,
  ProductOption,
  User,
} from './types';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RawOption = {
  id: string;
  name: string;
  type: OptionType;
  priceAdjustment: number | string;
  isAvailable: boolean;
};

type RawProduct = {
  id: string;
  name: string;
  description?: string;
  price?: number | string;
  basePrice?: number | string;
  imageUrl?: string;
  stock?: number;
  missingIngredients?: string[];
  status?: 'ACTIVE' | 'HIDDEN';
  options?:
    | RawOption[]
    | {
        sizes?: RawOption[];
        toppings?: RawOption[];
      };
};

function normalizeOptions(
  options: RawProduct['options'],
): ProductOption[] {
  if (!options) return [];

  const list = Array.isArray(options)
    ? options
    : [...(options.sizes ?? []), ...(options.toppings ?? [])];

  return list.map((option) => ({
    id: option.id,
    name: option.name,
    type: option.type,
    priceAdjustment: Number(option.priceAdjustment),
    isAvailable: option.isAvailable,
  }));
}

function normalizeProduct(raw: RawProduct): Product {
  if (!raw.status || !['ACTIVE', 'HIDDEN'].includes(raw.status)) {
    throw new ApiError(
      `Sản phẩm "${raw.name}" không có trạng thái hợp lệ.`,
      502,
    );
  }

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    price: Number(raw.price ?? raw.basePrice ?? 0),
    imageUrl: raw.imageUrl ?? '',
    stock: Number(raw.stock ?? 0),
    missingIngredients: raw.missingIngredients ?? [],
    status: raw.status,
    options: normalizeOptions(raw.options),
  };
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const token = getStoredToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = `API trả về lỗi ${response.status}.`;

    try {
      const body = (await response.json()) as {
        message?: string | string[];
      };

      if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      // Giữ message mặc định nếu response không phải JSON.
    }

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  // Products
  getProducts: async (): Promise<Product[]> => {
    const list = await request<RawProduct[]>('/products');
    return list.map(normalizeProduct);
  },

  getProduct: async (id: string): Promise<Product> => {
    const raw = await request<RawProduct>(
      `/products/${encodeURIComponent(id)}`,
    );

    return normalizeProduct(raw);
  },

  // Authentication
  login: (
    email: string,
    password: string,
  ): Promise<AuthResponse> =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  register: async (
    email: string,
    password: string,
    username?: string,
  ): Promise<AuthResponse> => {
    await request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });

    return api.login(email, password);
  },

  getMe: (): Promise<User> => request<User>('/auth/me'),

  // Orders
  getMyOrders: (): Promise<Order[]> =>
    request<Order[]>('/orders/me'),

  getOrderById: (id: string): Promise<Order> =>
    request<Order>(`/orders/${encodeURIComponent(id)}`),

  cancelOrder: (id: string): Promise<Order> =>
    request<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),

  createOrder: (payload: {
    items: Array<{
      productId: string;
      quantity: number;
      sizeOptionId?: string;
      toppingOptionIds?: string[];
    }>;
    promoCode?: string;
  }): Promise<Order> =>
    request<Order>('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Payments
  getPaymentConfig: (): Promise<{ provider: 'mock' | 'vnpay' }> =>
    request('/payments/config'),

  getPaymentStatus: (orderId: string): Promise<PaymentOrderStatus> =>
    request(`/payments/order/${encodeURIComponent(orderId)}`),

  createPayment: (
    payload: {
      orderId: string;
      method: PaymentMethod;
      simulateFailure?: boolean;
    },
    idempotencyKey: string,
  ): Promise<PaymentResponse> =>
    request<PaymentResponse>('/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        orderId: payload.orderId,
        method: payload.method,
        simulateFailure: payload.simulateFailure,
        idempotencyKey,
      }),
    }),

  // Promotions
  validatePromotion: (
    code: string,
    subtotal: number,
  ): Promise<{
    valid: boolean;
    code: string;
    discountAmount: number;
    message?: string;
  }> =>
    request('/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal }),
    }),
};

export { API_URL };
