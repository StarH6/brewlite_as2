
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  calculateCartSubtotal,
  resolveCartItems,
  useCartHydrated,
  useCartStore,
} from '@/lib/cart-store';
import {
  clearVnpayAttempt,
  createIdempotencyKey,
  isPaymentPaid,
  readVnpayAttempt,
  saveVnpayAttempt,
} from '@/lib/payment';
import type { CartItem, PaymentMethod, Product } from '@/lib/types';
import { CardFormPanel, validateCard, type CardErrors } from './checkout/card-form-panel';
import { OrderSummary } from './checkout/order-summary';
import { PaymentMethods } from './checkout/payment-methods';
import type { CardInfo, CheckoutResult } from './checkout/types';
import { WalletQrPanel } from './checkout/wallet-qr-panel';
import { PaymentResult } from './payment-result';

type AppliedPromo = {
  code: string;
  discountAmount: number;
};

type PendingOrder = {
  id: string;
  code: string;
};

function getCancelErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Đơn hàng đã được thanh toán hoặc đang xử lý nên không thể hủy.';
    }

    if (error.status === 404) {
      return 'Không tìm thấy đơn hàng.';
    }

    return error.message || 'Không thể hủy đơn hàng.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
}

function getItemIssue(
  item: CartItem,
  product: Product | undefined,
): string | null {
  if (!product || !item.productAvailable) {
    return 'Sản phẩm không còn được bán. Vui lòng xóa món này khỏi giỏ hàng.';
  }

  if (product.stock <= 0) {
    const missing = product.missingIngredients ?? [];

    return missing.length > 0
      ? `Món hiện không đủ nguyên liệu: ${missing.join(', ')}.`
      : 'Món hiện đã hết hàng.';
  }

  if (item.quantity > product.stock) {
    return `Chỉ còn ${product.stock} phần. Vui lòng điều chỉnh số lượng.`;
  }

  if (item.missingOptionIds.length > 0) {
    const optionMap = new Map(
      product.options.map((option) => [option.id, option]),
    );

    const unavailableNames = item.missingOptionIds.map(
      (id) => optionMap.get(id)?.name ?? 'Tùy chọn đã bị xóa',
    );

    return `Tùy chọn ${unavailableNames.join(', ')} hiện không còn khả dụng.`;
  }

  return null;
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-full bg-coffee-100" />
      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="h-96 animate-pulse rounded-3xl bg-coffee-50 lg:col-span-7" />
        <div className="h-96 animate-pulse rounded-3xl bg-coffee-50 lg:col-span-5" />
      </div>
    </div>
  );
}

function EmptyCheckout() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <div className="rounded-3xl border border-coffee-200/80 bg-white/95 p-8 shadow-card">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cream text-coffee-600">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>

        <h2 className="mt-4 text-xl font-bold text-coffee-900">
          Giỏ hàng của bạn đang trống
        </h2>

        <p className="mt-2 text-sm text-coffee-600">
          Không có đồ uống nào cần thanh toán. Hãy chọn món từ thực đơn.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block w-full rounded-full bg-coffee-800 py-3 text-sm font-semibold text-cream transition hover:bg-coffee-700"
        >
          Xem thực đơn
        </Link>
      </div>
    </div>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const updateUser = useAuthStore((state) => state.updateUser);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const authHydrated = useAuthStore((state) => state.hasHydrated);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  // Dữ liệu trong Zustand chỉ chứa ID lựa chọn và số lượng.
  const selections = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const cartHydrated = useCartHydrated();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  // Resolve dữ liệu giỏ hàng bằng Product API.
  const items = useMemo(
    () => (products ? resolveCartItems(selections, products) : []),
    [selections, products],
  );

  const subtotal = useMemo(
    () => calculateCartSubtotal(items),
    [items],
  );

  const productMap = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product])),
    [products],
  );

  const itemIssues = useMemo(() => {
    const issues = new Map<string, string>();

    if (!products) return issues;

    for (const item of items) {
      const issue = getItemIssue(item, productMap.get(item.productId));

      if (issue) {
        issues.set(item.key, issue);
      }
    }

    return issues;
  }, [items, products, productMap]);

  const hasInvalidItems = itemIssues.size > 0;

  const [method, setMethod] = useState<PaymentMethod>('WALLET');
  const [walletVerified, setWalletVerified] = useState(false);
  const [cardInfo, setCardInfo] = useState<CardInfo>({
    number: '',
    holderName: '',
    expiry: '',
    cvv: '',
  });
  const [cardErrors, setCardErrors] = useState<CardErrors>({});

  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);

  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [provider, setProvider] = useState<'mock' | 'vnpay' | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isRestoringPayment, setIsRestoringPayment] = useState(true);
  const [restoreError, setRestoreError] = useState(false);

  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const submitHint =
    provider === 'mock' && method === 'WALLET' && !walletVerified
      ? 'Bấm "Kiểm tra giao dịch" sau khi quét mã QR để mở khóa nút thanh toán.'
      : undefined;

  const hasProductValidationError =
    isLoadingProducts || products === null || Boolean(productError) || hasInvalidItems;

  useEffect(() => {
    let cancelled = false;
    api.getPaymentConfig().then((config) => {
      if (!['mock', 'vnpay'].includes(config.provider)) throw new Error('Cổng thanh toán không được hỗ trợ.');
      if (!cancelled) setProvider(config.provider);
    }).catch(() => {
      if (!cancelled) setConfigError('Không thể tải cấu hình thanh toán. Vui lòng tải lại trang.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authHydrated || !user || !provider) return;
    if (provider !== 'vnpay') {
      setIsRestoringPayment(false);
      return;
    }
    const attempt = readVnpayAttempt(user.id);
    if (!attempt) {
      setIsRestoringPayment(false);
      return;
    }
    let cancelled = false;
    api.getPaymentStatus(attempt.order.id).then((status) => {
      if (cancelled) return;
      if (status.orderStatus === 'PENDING' || status.orderStatus === 'PAYMENT_FAILED') {
        setPendingOrder(attempt.order);
      } else {
        if (status.orderStatus === 'CANCELLED') clearVnpayAttempt();
        router.replace(`/checkout/result?orderId=${encodeURIComponent(attempt.order.id)}`);
      }
    }).catch(() => {
      if (!cancelled) {
        setRestoreError(true);
        setFormError('Không thể khôi phục giao dịch đang chờ. Vui lòng tải lại trang, không tạo đơn thanh toán thứ hai.');
      }
    }).finally(() => {
      if (!cancelled) setIsRestoringPayment(false);
    });
    return () => { cancelled = true; };
  }, [authHydrated, user, provider, router]);

  useEffect(() => {
    if (!cartHydrated) return;

    let cancelled = false;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      setProductError(null);

      try {
        const latestProducts = await api.getProducts();

        if (cancelled) return;

        setProducts(latestProducts);
      } catch (error) {
        if (cancelled) return;

        setProductError(
          error instanceof Error
            ? error.message
            : 'Không thể kiểm tra tình trạng sản phẩm.',
        );
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      }
    };

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [cartHydrated]);

  useEffect(() => {
    const cleanCode = promoCode.trim().toUpperCase();

    if (!cleanCode || products === null) {
      setAppliedPromo(null);
      setPromoError(null);
      setIsValidatingPromo(false);
      return;
    }

    setIsValidatingPromo(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.validatePromotion(cleanCode, subtotal);

        if (response.valid) {
          setAppliedPromo({
            code: response.code,
            discountAmount: response.discountAmount,
          });
          setPromoError(null);
        } else {
          setAppliedPromo(null);
          setPromoError(response.message || 'Mã không đủ điều kiện áp dụng.');
        }
      } catch {
        setAppliedPromo(null);
        setPromoError('Không thể kiểm tra mã khuyến mãi.');
      } finally {
        setIsValidatingPromo(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [promoCode, subtotal, products]);

  useEffect(() => {
    if (!token && authHydrated) {
      router.replace('/login?redirect=/checkout');
    }
  }, [token, authHydrated, router]);

  const handleMethodChange = (nextMethod: PaymentMethod) => {
    if (nextMethod === method) return;

    setMethod(nextMethod);
    setWalletVerified(false);
    setCardErrors({});
    setFormError(null);
  };

  const handleCheckWallet = () => {
    // Mô phỏng kiểm tra giao dịch QR; thực tế cần webhook từ cổng thanh toán.
    setWalletVerified(true);
    setFormError(null);
  };

  const handleCardChange = (nextCard: CardInfo) => {
    setCardInfo(nextCard);
    setCardErrors({});
  };

  const refreshProductStock = () => {
    // Nguyên liệu dùng chung có thể làm thay đổi tồn kho của nhiều món.
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['product'] });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || !provider || isRestoringPayment || restoreError) return;

    // Chỉ kiểm tra Product API khi cần tạo đơn mới.
    // Nếu đã có pendingOrder, tiếp tục thanh toán đơn hiện tại.
    if (!pendingOrder) {
      if (isLoadingProducts || !products) {
        setFormError('Đang kiểm tra sản phẩm. Vui lòng thử lại sau.');
        return;
      }

      if (productError) {
        setFormError('Không thể kiểm tra tình trạng sản phẩm. Vui lòng thử lại.');
        return;
      }

      if (hasInvalidItems) {
        setFormError(
          'Một số sản phẩm không còn khả dụng hoặc đã thay đổi tình trạng. Vui lòng quay lại giỏ hàng để điều chỉnh.',
        );
        return;
      }

      if (items.length === 0) {
        setFormError('Giỏ hàng đang trống.');
        return;
      }
    }

    if (provider === 'mock' && method === 'WALLET' && !walletVerified) {
      setFormError('Vui lòng bấm "Kiểm tra giao dịch" sau khi quét mã QR.');
      return;
    }

    if (provider === 'mock' && method === 'CARD') {
      const errors = validateCard(cardInfo);
      setCardErrors(errors);

      if (Object.keys(errors).length > 0) {
        setFormError('Vui lòng kiểm tra lại thông tin thẻ.');
        return;
      }
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      let activeOrder = pendingOrder;

      if (!activeOrder) {
        const createdOrder = await api.createOrder({
          items: selections.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeOptionId: item.sizeOptionId ?? undefined,
            toppingOptionIds: item.toppingOptionIds,
          })),
          promoCode:
            appliedPromo?.code ||
            (promoCode.trim() ? promoCode.trim() : undefined),
        });

        activeOrder = {
          id: createdOrder.id,
          code: createdOrder.orderCode,
        };

        setPendingOrder(activeOrder);
      }

      let idempotencyKey = createIdempotencyKey();
      if (provider === 'vnpay' && user) {
        const previous = readVnpayAttempt(user.id);
        if (previous?.order.id === activeOrder.id) idempotencyKey = previous.key;
        saveVnpayAttempt({
          userId: user.id, order: activeOrder, key: idempotencyKey,
          cartSnapshot: previous?.order.id === activeOrder.id
            ? previous.cartSnapshot : JSON.stringify(selections),
        });
        const status = await api.getPaymentStatus(activeOrder.id);
        if (status.payment || status.orderStatus !== 'PENDING') {
          router.push(`/checkout/result?orderId=${encodeURIComponent(activeOrder.id)}`);
          return;
        }
      }
      const paymentResponse = await api.createPayment(
        {
          orderId: activeOrder.id,
          method: provider === 'vnpay' ? 'CARD' : method,
          simulateFailure: provider === 'mock' ? simulateFailure : undefined,
        },
        idempotencyKey,
      );

      if (provider === 'vnpay') {
        if (paymentResponse.requiresRedirect && paymentResponse.paymentUrl) {
          window.location.assign(paymentResponse.paymentUrl);
        } else {
          router.push(`/checkout/result?orderId=${encodeURIComponent(activeOrder.id)}`);
        }
        return;
      }

      const amount = Number(paymentResponse.payment.amount);

      if (isPaymentPaid(paymentResponse)) {
        clearCart();

        try {
          const latestUser = await api.getMe();
          updateUser(latestUser);
        } catch {
          // Không ảnh hưởng kết quả thanh toán.
          // Điểm sẽ được đồng bộ lại ở lần tải dữ liệu tiếp theo.
        }

        setResult({
          status: 'SUCCESS',
          orderCode: activeOrder.code,
          amount,
          method,
        });

        return;
      }

      setResult({
        status: 'FAILED',
        orderCode: activeOrder.code,
        amount,
        method,
        reason: 'Giao dịch bị từ chối hoặc chưa được xác nhận thanh toán.',
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          clearAuth();
          setFormError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else {
          setFormError(error.message || 'Thanh toán không thành công.');
        }
      } else {
        setFormError(
          'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.',
        );
      }
    } finally {
      setIsSubmitting(false);
      // Tạo đơn đã giữ nguyên liệu, kể cả khi thanh toán thất bại.
      refreshProductStock();
    }
  };

  const handleRetry = () => {
    setResult(null);
    setWalletVerified(false);
    setCardErrors({});
    setFormError(null);
    setCancelError(null);
  };

  const cancelOrderAndGetCode = async (): Promise<string> => {
    if (!pendingOrder) {
      throw new Error('Không tìm thấy đơn hàng cần hủy.');
    }

    const cancelledOrder = await api.cancelOrder(pendingOrder.id);

    if (cancelledOrder.status !== 'CANCELLED') {
      throw new Error('Đơn hàng chưa được hủy. Vui lòng tải lại trang.');
    }

    refreshProductStock();
    if (provider === 'vnpay') clearVnpayAttempt();
    return pendingOrder.code;
  };

  const handleCancelOrder = async () => {
    if (!pendingOrder || isSubmitting || isCancelling) return;

    setCancelError(null);
    setIsCancelling(true);

    try {
      const orderCode = await cancelOrderAndGetCode();

      setPendingOrder(null);
      setWalletVerified(false);
      setResult({ status: 'CANCELLED', orderCode });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuth();
        router.replace('/login?redirect=/checkout');
        return;
      }

      setCancelError(getCancelErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancelAndGoBack = async () => {
    if (!pendingOrder || isSubmitting || isCancelling) return;

    setFormError(null);
    setIsCancelling(true);

    try {
      await cancelOrderAndGetCode();

      setPendingOrder(null);
      setWalletVerified(false);
      setCardErrors({});
      router.push('/cart');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuth();
        router.replace('/login?redirect=/checkout');
        return;
      }

      setFormError(getCancelErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleClearPromo = () => {
    setPromoCode('');
    setAppliedPromo(null);
    setPromoError(null);
  };

  if (!authHydrated || !cartHydrated || (!configError && (!provider || isRestoringPayment))) {
    return <CheckoutSkeleton />;
  }

  if (result) {
    return (
      <PaymentResult
        result={result}
        isCancelling={isCancelling}
        cancelError={cancelError}
        simulateFailure={simulateFailure}
        onRetry={handleRetry}
        onCancelOrder={handleCancelOrder}
      />
    );
  }

  if (selections.length === 0) {
    return <EmptyCheckout />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        {pendingOrder ? (
          <button
            type="button"
            onClick={handleCancelAndGoBack}
            disabled={isSubmitting || isCancelling}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-700 transition hover:text-rose-900 disabled:cursor-not-allowed disabled:text-rose-300"
          >
            <span aria-hidden="true">←</span>{' '}
            {isCancelling ? 'Đang hủy đơn...' : 'Hủy đơn và quay lại giỏ hàng'}
          </button>
        ) : (
          <Link
            href="/cart"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-coffee-600 transition hover:text-coffee-900"
          >
            <span aria-hidden="true">←</span> Quay lại giỏ hàng
          </Link>
        )}

        <div className="flex items-center gap-2 text-xs font-semibold text-coffee-500">
          <span className="text-coffee-400">1. Giỏ hàng</span>
          <span>›</span>
          <span className="rounded-full bg-coffee-800 px-3 py-1 text-cream">
            2. Thanh toán
          </span>
          <span>›</span>
          <span className="text-coffee-400">3. Hoàn tất</span>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-coffee-900 sm:text-3xl">
          Thanh toán đơn hàng
        </h1>
        <p className="mt-1 text-sm text-coffee-600">
          Xác nhận thông tin đặt món và chọn phương thức thanh toán.
        </p>
      </div>

      {isLoadingProducts && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-coffee-200 bg-coffee-50 p-4 text-sm text-coffee-700"
        >
          Đang tải thông tin sản phẩm và kiểm tra giá...
        </div>
      )}

      {productError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          Không thể tải thông tin sản phẩm: {productError}
          <p className="mt-1">
            Vui lòng tải lại trang trước khi tiếp tục thanh toán.
          </p>
        </div>
      )}

      {hasInvalidItems && !pendingOrder && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Một số sản phẩm không còn khả dụng.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {items.map((item) => {
              const issue = itemIssues.get(item.key);

              return issue ? (
                <li key={item.key}>
                  <span className="font-medium">{item.productName}:</span>{' '}
                  {issue}
                </li>
              ) : null;
            })}
          </ul>
          <Link
            href="/cart"
            className="mt-3 inline-block font-semibold underline"
          >
            Quay lại giỏ hàng để điều chỉnh
          </Link>
        </div>
      )}

      {(formError || configError) && (
        <div
          role="alert"
          className="mb-8 rounded-3xl border border-rose-200 bg-rose-50/90 p-5 shadow-sm"
        >
          <h2 className="text-sm font-bold text-rose-900">
            Không thể hoàn tất
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-700">
            {formError || configError}
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid gap-8 lg:grid-cols-12 lg:items-start"
      >
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          <section className="rounded-3xl border border-coffee-100 bg-white/95 p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold text-coffee-900">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-coffee-100 text-xs text-coffee-800">
                1
              </span>
              Thông tin nhận đồ uống
            </h2>

            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-2xl border border-coffee-100 bg-cream/30 p-3.5">
                <span className="text-xs text-coffee-500">Khách hàng</span>
                <p className="mt-0.5 font-semibold text-coffee-900">
                  {user?.username || user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-coffee-600">{user?.email}</p>
                {user?.loyaltyPoints !== undefined && (
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    Điểm tích lũy: {user.loyaltyPoints} điểm
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-coffee-100 bg-cream/30 p-3.5">
                <span className="text-xs text-coffee-500">
                  Hình thức phục vụ
                </span>
                <p className="mt-0.5 font-semibold text-coffee-900">
                  Nhận tại quầy
                </p>
                <p className="text-xs font-medium text-emerald-700">
                  Pha chế ngay sau khi thanh toán
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-coffee-100 bg-white/95 p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold text-coffee-900">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-coffee-100 text-xs text-coffee-800">
                2
              </span>
              Phương thức thanh toán
            </h2>

            <p className="mt-1 text-xs text-coffee-600">
              Chọn phương thức bạn muốn sử dụng để hoàn tất đơn hàng.
            </p>

            {provider && <PaymentMethods provider={provider} method={method} onChange={handleMethodChange} />}

            {provider === 'mock' && method === 'WALLET' && (
              <WalletQrPanel
                amount={finalTotal}
                orderCode={pendingOrder?.code}
                isVerified={walletVerified}
                onCheck={handleCheckWallet}
              />
            )}

            {provider === 'mock' && method === 'CARD' && (
              <CardFormPanel
                value={cardInfo}
                errors={cardErrors}
                onChange={handleCardChange}
              />
            )}

            {provider === 'mock' && <div className="mt-6 rounded-2xl border border-dashed border-coffee-200 bg-cream/40 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-coffee-800">
                    Mô phỏng thanh toán thất bại
                  </span>
                  <p className="text-[11px] text-coffee-500">
                    Bật tùy chọn này để kiểm tra luồng PAYMENT_FAILED.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(event) => setSimulateFailure(event.target.checked)}
                  className="h-4 w-4 rounded text-coffee-800 focus:ring-coffee-700"
                />
              </label>
            </div>}
          </section>
        </div>

        <OrderSummary
          items={items}
          subtotal={subtotal}
          discountAmount={discountAmount}
          finalTotal={finalTotal}
          promoCode={promoCode}
          appliedPromo={appliedPromo}
          promoError={promoError}
          isValidatingPromo={isValidatingPromo}
          isSubmitting={isSubmitting}
          isSubmitDisabled={
            !provider || isRestoringPayment || restoreError || Boolean(configError) ||
            (!pendingOrder && hasProductValidationError) ||
            (provider === 'mock' && method === 'WALLET' && !walletVerified)
          }
          submitHint={submitHint}
          isOrderCreated={Boolean(pendingOrder)}
          onPromoCodeChange={setPromoCode}
          onClearPromo={handleClearPromo}
        />
      </form>
    </div>
  );
}
