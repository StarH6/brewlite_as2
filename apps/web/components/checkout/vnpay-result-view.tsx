'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useCartHydrated, useCartStore } from '@/lib/cart-store';
import { formatVnd } from '@/lib/format';
import {
  clearVnpayAttempt,
  createIdempotencyKey,
  readVnpayAttempt,
  saveVnpayAttempt,
} from '@/lib/payment';
import type { PaymentOrderStatus } from '@/lib/types';

const FAILURE_MESSAGES: Record<string, string> = {
  '07': 'Giao dịch bị nghi ngờ gian lận. Vui lòng liên hệ hỗ trợ để kiểm tra.',
  '09': 'Thẻ hoặc tài khoản chưa đăng ký Internet Banking.',
  '10': 'Thông tin xác thực không đúng quá số lần cho phép.',
  '11': 'Giao dịch đã hết thời gian chờ tại VNPay.',
  '12': 'Thẻ hoặc tài khoản bị khóa.',
  '13': 'Mật khẩu OTP không đúng.',
  '24': 'Bạn đã hủy thanh toán trên VNPay.',
  '51': 'Tài khoản không đủ số dư.',
  '65': 'Vượt hạn mức giao dịch trong ngày.',
  '75': 'Ngân hàng đang bảo trì.',
  '79': 'Nhập sai mật khẩu thanh toán quá số lần quy định.',
};

export function VnpayResultView() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);
  const hydrated = useAuthStore((state) => state.hasHydrated);
  const updateUser = useAuthStore((state) => state.updateUser);
  const cartHydrated = useCartHydrated();
  const orderId = params.get('orderId');
  const invalidReturn = params.has('error');
  const [status, setStatus] = useState<PaymentOrderStatus | null>(null);
  const [provider, setProvider] = useState<'mock' | 'vnpay' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (invalidReturn || !orderId) {
      setLoading(false);
      return;
    }
    if (!hydrated) return;
    if (!token || !userId) {
      const redirect = `/checkout/result?orderId=${encodeURIComponent(orderId)}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getPaymentStatus(orderId), api.getPaymentConfig()]).then(([result, config]) => {
      if (cancelled) return;
      setStatus(result);
      setProvider(config.provider);
    }).catch((failure: unknown) => {
      if (cancelled) return;
      if (failure instanceof ApiError && failure.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(`/checkout/result?orderId=${orderId}`)}`);
      } else {
        setError(failure instanceof Error ? failure.message : 'Không thể tải kết quả thanh toán.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [hydrated, token, userId, orderId, invalidReturn, router, revision]);

  const successful = status?.payment?.status === 'PAID' &&
    !status.payment.refundRequired && status.orderStatus !== 'CANCELLED';

  useEffect(() => {
    if (status?.orderStatus !== 'CANCELLED' || !userId) return;
    if (readVnpayAttempt(userId)?.order.id === status.orderId) clearVnpayAttempt();
  }, [status, userId]);

  useEffect(() => {
    if (!successful || !status || !userId || !cartHydrated) return;
    const attempt = readVnpayAttempt(userId);
    if (attempt?.order.id === status.orderId) {
      // Never clear a different/new cart opened in another tab.
      if (JSON.stringify(useCartStore.getState().items) === attempt.cartSnapshot) {
        useCartStore.getState().clear();
      }
      clearVnpayAttempt();
    }
    void api.getMe().then(updateUser).catch(() => {
      // A refresh of loyalty must not invalidate a committed payment.
    });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['product'] });
  }, [successful, status, userId, cartHydrated, updateUser, queryClient]);

  const retryPayment = async () => {
    if (!status || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const latest = await api.getPaymentStatus(status.orderId);
      setStatus(latest);
      const firstAttempt = latest.orderStatus === 'PENDING' && !latest.payment;
      const failedAttempt = latest.orderStatus === 'PAYMENT_FAILED' && latest.payment?.status === 'FAILED';
      if (!firstAttempt && !failedAttempt) return;
      const previous = readVnpayAttempt(userId);
      const key = previous?.order.id === latest.orderId &&
        previous.key !== latest.payment?.idempotencyKey
        ? previous.key : createIdempotencyKey();
      saveVnpayAttempt({
        userId, order: { id: latest.orderId, code: latest.orderCode }, key,
        cartSnapshot: previous?.order.id === latest.orderId
          ? previous.cartSnapshot : '',
      });
      const payment = await api.createPayment({
        orderId: latest.orderId, method: 'CARD',
      }, key);
      if (payment.requiresRedirect && payment.paymentUrl) {
        window.location.assign(payment.paymentUrl);
      } else {
        setRevision((value) => value + 1);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể tạo lượt thanh toán mới.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!status || busy || !window.confirm(
      'Hủy đơn này? Nếu bạn đã trả tiền tại VNPay nhưng BrewLite chưa nhận được kết quả, cần liên hệ hỗ trợ để đối soát.',
    )) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelOrder(status.orderId);
      clearVnpayAttempt();
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể hủy đơn.');
    } finally {
      setBusy(false);
    }
  };

  const pending = status?.payment?.status === 'INITIATED';
  const cancelledOrder = status?.orderStatus === 'CANCELLED';
  const needsSupport = status?.payment?.refundRequired ||
    (cancelledOrder && status?.payment?.status === 'PAID');
  const canResume = provider === 'vnpay' && pending &&
    status?.orderStatus === 'PENDING' && status.payment?.paymentUrl &&
    status.payment.expiresAt && new Date(status.payment.expiresAt).getTime() > Date.now();
  const canRetry = provider === 'vnpay' && (
    (status?.orderStatus === 'PAYMENT_FAILED' && status.payment?.status === 'FAILED') ||
    (status?.orderStatus === 'PENDING' && !status.payment)
  );
  const buttonClass = 'rounded-full bg-coffee-800 px-5 py-3 text-sm font-semibold text-cream disabled:opacity-50';

  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-3xl border border-coffee-200 bg-white p-6 shadow-card sm:p-10">
        <h1 className="text-2xl font-bold text-coffee-900">
          {invalidReturn ? 'Không thể xác thực kết quả VNPay' :
            loading ? 'Đang kiểm tra kết quả thanh toán...' :
              needsSupport ? 'Đã ghi nhận thanh toán — cần đối soát' :
                successful ? 'Thanh toán thành công' :
                  cancelledOrder ? 'Đơn hàng đã hủy' :
                    pending ? 'Chưa nhận được xác nhận thanh toán' : 'Kết quả thanh toán'}
        </h1>
        {invalidReturn && (
          <p role="alert" className="mt-4 text-sm text-rose-800">
            Return URL không hợp lệ hoặc không khớp giao dịch. Không thể dùng đường dẫn này để xác nhận thanh toán.
            Nếu VNPay đã báo trừ tiền, không thanh toán lại; hãy liên hệ hỗ trợ.
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-rose-800">{error}</p>}
        {!loading && status && !invalidReturn && (
          <div className="mt-5 space-y-4 text-sm text-coffee-700">
            <p>Đơn hàng: <strong>{status.orderCode}</strong></p>
            {status.payment && <p>Số tiền: <strong>{formatVnd(Number(status.payment.amount))}</strong></p>}
            {successful && <p>Cảm ơn bạn! Đơn hàng đã được xác nhận thanh toán.</p>}
            {needsSupport && (
              <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
                Giao dịch đã thành công nhưng đơn không còn ở trạng thái chờ thanh toán.
                Không thanh toán lại. Vui lòng liên hệ nhân viên để đối soát/hoàn tiền thủ công.
                Mã giao dịch: {status.payment?.transactionReference}.
              </p>
            )}
            {pending && (
              <p className="rounded-xl bg-amber-50 p-4 text-amber-900">
                Chế độ demo chưa dùng IPN: BrewLite chỉ nhận kết quả khi trình duyệt quay về từ VNPay.
                Đóng tab hoặc mất kết nối không có nghĩa là thanh toán thất bại.
                Nếu đã trả tiền, không thanh toán lại; hãy quay về bằng trang VNPay hoặc liên hệ hỗ trợ.
              </p>
            )}
            {status.payment?.status === 'FAILED' && (
              <p>{FAILURE_MESSAGES[status.payment.responseCode ?? ''] ?? 'VNPay trả về giao dịch không thành công.'}</p>
            )}
            {cancelledOrder && <p>Đơn đã bị hủy và không thể tiếp tục thanh toán cho đơn này.</p>}
            {!status.payment && !cancelledOrder && <p>Đơn chưa có giao dịch thanh toán.</p>}
            <div className="flex flex-wrap gap-3 pt-2">
              {canResume && (
                <button className={buttonClass} disabled={busy} onClick={() => window.location.assign(status.payment!.paymentUrl!)}>
                  Tiếp tục trên VNPay
                </button>
              )}
              {canRetry && <button className={buttonClass} disabled={busy} onClick={retryPayment}>
                {status.payment ? 'Thử lại thanh toán' : 'Thanh toán qua VNPay'}
              </button>}
              {provider === 'mock' && !status.payment && !cancelledOrder && <Link className={buttonClass} href="/checkout">Quay lại checkout</Link>}
              {['PENDING', 'PAYMENT_FAILED'].includes(status.orderStatus) && (
                <button className={buttonClass} disabled={busy} onClick={cancelOrder}>Hủy đơn</button>
              )}
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-coffee-800">
          {orderId && !invalidReturn && <button disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}>Tải lại trạng thái</button>}
          <Link href="/orders">Lịch sử đơn hàng</Link>
          <Link href="/">Về thực đơn</Link>
        </div>
      </div>
    </section>
  );
}
