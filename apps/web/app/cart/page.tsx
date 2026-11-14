import type { Metadata } from 'next';
import { CartView } from '@/components/cart-view';

export const metadata: Metadata = {
  title: 'Giỏ hàng',
  description: 'Quản lý giỏ hàng, xem trước tổng tiền và chuẩn bị đặt hàng tại BrewLite.',
};

export default function CartPage() {
  return <CartView />;
}

