import type { PaymentMethod } from '@/lib/types';

export type CardInfo = {
  number: string;
  holderName: string;
  expiry: string;
  cvv: string;
};

export type CheckoutResult =
  | {
      status: 'SUCCESS';
      orderCode: string;
      amount: number;
      method: PaymentMethod;
    }
  | {
      status: 'FAILED';
      orderCode: string;
      amount: number;
      method: PaymentMethod;
      reason: string;
    }
  | {
      status: 'CANCELLED';
      orderCode: string;
    };
