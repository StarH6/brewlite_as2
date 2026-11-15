import Image from 'next/image';
import { formatVnd } from '@/lib/format';

type WalletQrPanelProps = {
  amount: number;
  orderCode?: string;
  isVerified: boolean;
  onCheck: () => void;
};

export function WalletQrPanel({ amount, orderCode, isVerified, onCheck }: WalletQrPanelProps) {
  return (
    <div className="mt-4 rounded-2xl border border-coffee-100 bg-cream/30 p-4">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="rounded-2xl border border-coffee-200 bg-white p-2">
          <Image
            src="/images/QR_code.png"
            alt="Mã QR thanh toán"
            width={200}
            height={200}
            className="h-48 w-48 object-contain"
          />
        </div>

        <div className="flex-1 text-center sm:text-left">
          <p className="font-semibold text-coffee-900">Quét mã để thanh toán</p>
          <p className="mt-1 text-xs leading-5 text-coffee-600">
            Mở ứng dụng MoMo, ZaloPay hoặc ứng dụng ngân hàng để quét mã.
          </p>

          <div className="mt-4">
            <p className="text-xs text-coffee-500">Số tiền cần thanh toán</p>
            <p className="mt-0.5 text-xl font-bold text-coffee-900">{formatVnd(amount)}</p>
          </div>

          {orderCode && (
            <p className="mt-3 text-xs text-coffee-600">
              Nội dung chuyển khoản:{' '}
              <span className="font-mono font-semibold text-coffee-900">{orderCode}</span>
            </p>
          )}

          <p className="mt-3 text-xs leading-5 text-coffee-500">
            Sau khi chuyển khoản, bấm &quot;Kiểm tra giao dịch&quot; để mở khóa nút thanh toán.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {isVerified ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
            Đã ghi nhận giao dịch. Bạn có thể bấm nút thanh toán.
          </div>
        ) : (
          <button
            type="button"
            onClick={onCheck}
            className="w-full rounded-xl border border-coffee-300 bg-white px-4 py-2.5 text-sm font-semibold text-coffee-800 transition hover:bg-coffee-50"
          >
            Kiểm tra giao dịch
          </button>
        )}
      </div>
    </div>
  );
}
