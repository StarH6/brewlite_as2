import type { PaymentMethod } from '@/lib/types';

type PaymentMethodsProps = {
  method: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  provider?: 'mock' | 'vnpay';
};

export function PaymentMethods({ method, onChange, provider = 'mock' }: PaymentMethodsProps) {
  if (provider === 'vnpay') {
    return (
      <div className="mt-5 rounded-2xl border border-coffee-800 bg-coffee-50 p-4">
        <p className="font-semibold text-coffee-900">VNPay Sandbox</p>
        <p className="mt-1 text-sm text-coffee-600">
          Chọn ngân hàng, thẻ hoặc QR trên trang VNPay. Không nhập thông tin thẻ hay OTP tại BrewLite.
        </p>
        <p className="mt-2 text-xs text-amber-800">Môi trường thử nghiệm, không sử dụng tiền/thẻ thật.</p>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-3">
      <label
        className={`relative flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
          method === 'WALLET'
            ? 'border-coffee-800 bg-coffee-50/60 ring-2 ring-coffee-800/20'
            : 'border-coffee-200/80 bg-white hover:bg-cream/20'
        }`}
      >
        <input
          type="radio"
          name="paymentMethod"
          value="WALLET"
          checked={method === 'WALLET'}
          onChange={() => onChange('WALLET')}
          className="mt-1 h-4 w-4 text-coffee-800 focus:ring-coffee-700"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-coffee-900">Ví điện tử (QR)</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                MoMo
              </span>
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                ZaloPay
              </span>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-coffee-600">
            Quét mã QR bằng ứng dụng ví điện tử hoặc ngân hàng.
          </p>
        </div>
      </label>

      <label
        className={`relative flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
          method === 'CARD'
            ? 'border-coffee-800 bg-coffee-50/60 ring-2 ring-coffee-800/20'
            : 'border-coffee-200/80 bg-white hover:bg-cream/20'
        }`}
      >
        <input
          type="radio"
          name="paymentMethod"
          value="CARD"
          checked={method === 'CARD'}
          onChange={() => onChange('CARD')}
          className="mt-1 h-4 w-4 text-coffee-800 focus:ring-coffee-700"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-coffee-900">Thẻ ngân hàng</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                ATM
              </span>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                Visa
              </span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                Mastercard
              </span>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-coffee-600">
            Nhập thông tin thẻ ATM nội địa hoặc thẻ thanh toán quốc tế.
          </p>
        </div>
      </label>
    </div>
  );
}
