import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VnpayResultView } from '@/components/checkout/vnpay-result-view';

export const metadata: Metadata = {
  title: 'Kết quả thanh toán | BrewLite',
};

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">Đang tải kết quả thanh toán...</p>}>
      <VnpayResultView />
    </Suspense>
  );
}
