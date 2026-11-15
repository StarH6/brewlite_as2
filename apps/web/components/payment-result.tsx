'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatVnd } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import type { CheckoutResult } from './checkout/types';

type PaymentResultProps = {
  result: CheckoutResult;
  isCancelling: boolean;
  cancelError: string | null;
  simulateFailure: boolean;
  onRetry: () => void;
  onCancelOrder: () => void;
};

function getMethodLabel(method: PaymentMethod): string {
  return method === 'WALLET' ? 'Ví điện tử (QR)' : 'Thẻ ngân hàng';
}

function SuccessResult({ result }: { result: Extract<CheckoutResult, { status: 'SUCCESS' }> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.orderCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-card sm:p-10">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <svg
            className="h-9 w-9"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="mt-4 inline-block rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-semibold text-emerald-800">
          Giao dịch thành công
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-coffee-900 sm:text-3xl">
          Cảm ơn bạn đã đặt món
        </h1>
        <p className="mt-1 text-sm text-coffee-600">
          Đơn hàng đã được ghi nhận và chuyển tới quầy pha chế.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-coffee-100 bg-cream/30 p-5">
        <div className="flex items-center justify-between border-b border-coffee-100 pb-3">
          <span className="text-xs font-medium uppercase tracking-wider text-coffee-500">
            Mã đơn hàng
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-coffee-900">
              {result.orderCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-coffee-200 bg-white px-2 py-0.5 text-xs text-coffee-700 hover:bg-coffee-100"
            >
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between text-coffee-700">
            <span>Số tiền thanh toán</span>
            <span className="text-base font-bold text-coffee-900">{formatVnd(result.amount)}</span>
          </div>
          <div className="flex justify-between text-coffee-700">
            <span>Phương thức</span>
            <span className="font-medium">{getMethodLabel(result.method)}</span>
          </div>
          <div className="flex justify-between rounded-xl border border-amber-200/60 bg-amber-50 px-3 py-2 text-amber-900">
            <span className="font-medium">Điểm thưởng tích lũy</span>
            <span className="font-bold text-amber-800">
              +{Math.floor(result.amount / 10000)} điểm
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/"
          className="block w-full rounded-full bg-coffee-800 py-3.5 text-center text-sm font-semibold text-cream shadow-sm transition hover:bg-coffee-700"
        >
          Tiếp tục chọn đồ uống
        </Link>
      </div>
    </div>
  );
}

function FailedResult({
  result,
  isCancelling,
  cancelError,
  simulateFailure,
  onRetry,
  onCancelOrder,
}: {
  result: Extract<CheckoutResult, { status: 'FAILED' }>;
  isCancelling: boolean;
  cancelError: string | null;
  simulateFailure: boolean;
  onRetry: () => void;
  onCancelOrder: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <div className="overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-6 shadow-card sm:p-10">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-600">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <span className="mt-4 inline-block rounded-full bg-rose-100 px-3.5 py-1 text-xs font-semibold text-rose-800">
          Giao dịch thất bại
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-coffee-900 sm:text-3xl">
          Thanh toán thất bại
        </h1>
        <p className="mt-1 text-sm text-coffee-600">
          Đơn hàng chưa được thanh toán thành công. Vui lòng thử lại!
        </p>
      </div>

      <div className="mt-8 space-y-2.5 rounded-2xl border border-coffee-100 bg-cream/30 p-5 text-sm">
        <div className="flex justify-between gap-4 text-coffee-700">
          <span>Mã đơn hàng</span>
          <span className="font-mono font-semibold text-coffee-900">{result.orderCode}</span>
        </div>
        <div className="flex justify-between gap-4 text-coffee-700">
          <span>Số tiền</span>
          <span className="font-semibold text-coffee-900">{formatVnd(result.amount)}</span>
        </div>
        <div className="flex justify-between gap-4 text-coffee-700">
          <span>Phương thức</span>
          <span className="font-medium">{getMethodLabel(result.method)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-coffee-100 pt-2.5 text-coffee-700">
          <span>Lý do</span>
          <span className="max-w-[65%] text-right font-medium text-rose-700">{result.reason}</span>
        </div>
      </div>

      {cancelError && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {cancelError}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={isCancelling}
          className="w-full rounded-full bg-coffee-800 py-3.5 text-sm font-semibold text-cream transition hover:bg-coffee-700 disabled:cursor-not-allowed disabled:bg-coffee-300"
        >
          Thử thanh toán lại
        </button>

        {confirmingCancel ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-900">
              Bạn chắc chắn muốn hủy đơn hàng này?
            </p>
            <p className="mt-1 text-xs text-rose-700">
              Đơn hàng sẽ chuyển sang trạng thái đã hủy và tồn kho được hoàn lại.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onCancelOrder}
                disabled={isCancelling}
                className="flex-1 rounded-full bg-rose-700 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                {isCancelling ? 'Đang hủy đơn...' : 'Đồng ý hủy'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={isCancelling}
                className="flex-1 rounded-full border border-rose-200 bg-white py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed"
              >
                Không hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="w-full rounded-full border border-rose-200 bg-white py-3.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Hủy đơn hàng
          </button>
        )}
      </div>
    </div>
  );
}

function CancelledResult({ orderCode }: { orderCode: string }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-coffee-100 bg-white/95 p-6 shadow-card sm:p-10">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-coffee-100 text-coffee-700">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M8 12h8" />
          </svg>
        </div>
        <span className="mt-4 inline-block rounded-full bg-coffee-100 px-3.5 py-1 text-xs font-semibold text-coffee-800">
          Đơn hàng đã hủy
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-coffee-900 sm:text-3xl">
          Đã hủy đơn hàng
        </h1>
        <p className="mt-1 text-sm text-coffee-600">
          Đơn hàng đã được hủy và tồn kho của các món đã được hoàn lại.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-coffee-100 bg-cream/30 p-5 text-sm">
        <div className="flex justify-between gap-4 text-coffee-700">
          <span>Mã đơn hàng</span>
          <span className="font-mono font-semibold text-coffee-900">{orderCode}</span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <Link
          href="/cart"
          className="block w-full rounded-full bg-coffee-800 py-3.5 text-center text-sm font-semibold text-cream transition hover:bg-coffee-700"
        >
          Về giỏ hàng
        </Link>
        <Link
          href="/orders"
          className="block w-full rounded-full border border-coffee-200 bg-cream/40 py-3 text-center text-sm font-semibold text-coffee-800 transition hover:bg-coffee-100"
        >
          Xem đơn hàng
        </Link>
      </div>
    </div>
  );
}

export function PaymentResult({
  result,
  isCancelling,
  cancelError,
  simulateFailure,
  onRetry,
  onCancelOrder,
}: PaymentResultProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {result.status === 'SUCCESS' && <SuccessResult result={result} />}
      {result.status === 'FAILED' && (
        <FailedResult
          result={result}
          isCancelling={isCancelling}
          cancelError={cancelError}
          simulateFailure={simulateFailure}
          onRetry={onRetry}
          onCancelOrder={onCancelOrder}
        />
      )}
      {result.status === 'CANCELLED' && <CancelledResult orderCode={result.orderCode} />}
    </div>
  );
}
