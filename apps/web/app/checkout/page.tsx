import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout-view';

export const metadata: Metadata = {
  title: 'Thanh toán đơn hàng | BrewLite',
  description: 'Thanh toán an toàn, bảo mật và tiện lợi cho đơn hàng của bạn tại BrewLite.',
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
