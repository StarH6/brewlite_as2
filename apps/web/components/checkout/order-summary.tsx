import Image from 'next/image';
import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import type { CartItem } from '@/lib/types';

type AppliedPromo = {
  code: string;
  discountAmount: number;
};

type OrderSummaryProps = {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
  promoCode: string;
  appliedPromo: AppliedPromo | null;
  promoError: string | null;
  isValidatingPromo: boolean;
  isSubmitting: boolean;
  isSubmitDisabled: boolean;
  submitHint?: string;
  isOrderCreated: boolean;
  onPromoCodeChange: (value: string) => void;
  onClearPromo: () => void;
};

export function OrderSummary({
  items,
  subtotal,
  discountAmount,
  finalTotal,
  promoCode,
  appliedPromo,
  promoError,
  isValidatingPromo,
  isSubmitting,
  isSubmitDisabled,
  submitHint,
  isOrderCreated,
  onPromoCodeChange,
  onClearPromo,
}: OrderSummaryProps) {
  return (
    <div className="sticky top-24 rounded-3xl border border-coffee-100 bg-white/95 p-6 shadow-card lg:col-span-5 xl:col-span-4">
      <h2 className="text-lg font-semibold text-coffee-900">Chi tiết đơn hàng</h2>

      <div className="mt-4 max-h-60 space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-3 border-b border-coffee-100/60 pb-3 text-sm"
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-cream">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.productName}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-[10px] font-bold text-coffee-400">
                  BL
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium text-coffee-900">{item.productName}</h3>
              <p className="text-xs text-coffee-500">
                {item.size ? `Size ${item.size.name}` : ''}
                {item.toppings.length > 0
                  ? ` + ${item.toppings.map((topping) => topping.name).join(', ')}`
                  : ''}
              </p>
              <p className="text-xs text-coffee-600">x{item.quantity}</p>
            </div>
            <div className="text-right font-medium text-coffee-900">
              {formatVnd(item.unitPrice * item.quantity)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-coffee-100 bg-cream/20 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="promoCodeInput" className="block text-xs font-semibold text-coffee-800">
            Mã khuyến mãi
          </label>
          {isValidatingPromo && (
            <span className="text-[11px] text-coffee-500">Đang kiểm tra mã...</span>
          )}
        </div>

        <div className="mt-1.5 flex gap-2">
          <div className="relative flex-1">
            <input
              id="promoCodeInput"
              type="text"
              placeholder="VD: WELCOME10"
              value={promoCode}
              onChange={(event) => onPromoCodeChange(event.target.value.toUpperCase())}
              disabled={isOrderCreated}
              className="w-full rounded-xl border border-coffee-200 bg-white px-3 py-2 pr-7 text-xs font-semibold uppercase tracking-wider text-coffee-900 focus:border-coffee-700 focus:outline-none disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:text-coffee-500"
            />
            {promoCode && !isOrderCreated && (
              <button
                type="button"
                onClick={onClearPromo}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-coffee-400 hover:text-coffee-700"
                title="Xóa mã"
              >
                X
              </button>
            )}
          </div>
        </div>

        {isOrderCreated && (
          <p className="mt-2 text-[11px] leading-4 text-coffee-500">
            Đơn hàng đã được tạo nên mã giảm giá không thể thay đổi.
          </p>
        )}

        {appliedPromo && (
          <p className="mt-2 text-xs font-semibold text-emerald-700">
            Đã áp dụng mã {appliedPromo.code}: giảm {formatVnd(appliedPromo.discountAmount)}
          </p>
        )}

        {promoError && <p className="mt-2 text-xs font-medium text-rose-600">{promoError}</p>}
      </div>

      <div className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between text-coffee-600">
          <span>Tạm tính</span>
          <span className="font-medium text-coffee-900">{formatVnd(subtotal)}</span>
        </div>

        {appliedPromo && discountAmount > 0 && (
          <div className="flex justify-between rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-emerald-800">
            <span className="font-medium">Giảm giá voucher ({appliedPromo.code})</span>
            <span className="font-bold text-emerald-700">-{formatVnd(discountAmount)}</span>
          </div>
        )}

        <div className="flex justify-between text-coffee-600">
          <span>Phí dịch vụ</span>
          <span className="font-semibold text-emerald-700">Miễn phí</span>
        </div>

        <div className="my-3 border-t border-coffee-100" />

        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-base font-semibold text-coffee-900">Tổng thanh toán</span>
            <p className="text-[11px] text-coffee-500">Đã bao gồm thuế VAT</p>
          </div>
          <span className="text-2xl font-bold tracking-tight text-coffee-900">
            {formatVnd(finalTotal)}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="submit"
          disabled={isSubmitting || isSubmitDisabled}
          className={`w-full rounded-full py-4 text-center text-sm font-semibold transition shadow-sm ${
            isSubmitting || isSubmitDisabled
              ? 'cursor-not-allowed bg-coffee-300 text-white'
              : 'bg-coffee-800 text-cream hover:bg-coffee-700'
          }`}
        >
          {isSubmitting ? 'Đang xử lý giao dịch...' : `Xác nhận đơn hàng - ${formatVnd(finalTotal)}`}
        </button>

        {submitHint && !isSubmitting && (
          <p className="text-center text-xs leading-5 text-amber-700">{submitHint}</p>
        )}

        {isOrderCreated ? (
          <p className="text-center text-xs leading-5 text-coffee-500">
            Đơn hàng đã được tạo. Bạn có thể đổi phương thức và thử lại.
          </p>
        ) : (
          <Link
            href="/cart"
            className="block w-full rounded-full border border-coffee-200 bg-cream/40 py-3 text-center text-sm font-semibold text-coffee-800 transition hover:bg-coffee-100"
          >
            Chỉnh sửa lại giỏ hàng
          </Link>
        )}
      </div>
    </div>
  );
}
