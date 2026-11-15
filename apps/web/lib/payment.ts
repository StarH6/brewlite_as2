import type { PaymentResponse } from './types';

export const VNPAY_CHECKOUT_STORAGE_KEY = 'brewlite_vnpay_checkout';

export type VnpayCheckoutAttempt = {
  userId: string;
  order: { id: string; code: string };
  key: string;
  cartSnapshot: string;
};

export function readVnpayAttempt(userId: string): VnpayCheckoutAttempt | null {
  try {
    const raw = sessionStorage.getItem(VNPAY_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as VnpayCheckoutAttempt;
    return value.userId === userId &&
      typeof value.order?.id === 'string' &&
      typeof value.order?.code === 'string' &&
      typeof value.key === 'string' &&
      typeof value.cartSnapshot === 'string'
      ? value : null;
  } catch {
    return null;
  }
}

export function saveVnpayAttempt(value: VnpayCheckoutAttempt): void {
  sessionStorage.setItem(VNPAY_CHECKOUT_STORAGE_KEY, JSON.stringify(value));
}

export function clearVnpayAttempt(): void {
  try {
    sessionStorage.removeItem(VNPAY_CHECKOUT_STORAGE_KEY);
  } catch {
    // Storage may be disabled. Backend state is still authoritative.
  }
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isPaymentPaid(response: PaymentResponse): boolean {
  return response.orderStatus === 'PAID' || response.payment.status === 'PAID';
}
