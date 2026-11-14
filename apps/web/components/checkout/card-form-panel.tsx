import type { CardInfo } from './types';

export type CardErrors = Partial<Record<keyof CardInfo, string>>;

export function validateCard(card: CardInfo): CardErrors {
  const errors: CardErrors = {};
  const digits = card.number.replace(/\s/g, '');

  if (!/^\d{16}$/.test(digits)) {
    errors.number = 'Số thẻ phải gồm 16 chữ số.';
  }
  if (card.holderName.trim().length < 2) {
    errors.holderName = 'Vui lòng nhập tên chủ thẻ.';
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) {
    errors.expiry = 'Ngày hết hạn có dạng MM/YY.';
  }
  if (!/^\d{3,4}$/.test(card.cvv)) {
    errors.cvv = 'CVV gồm 3 hoặc 4 chữ số.';
  }

  return errors;
}

function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

type CardFormPanelProps = {
  value: CardInfo;
  errors: CardErrors;
  onChange: (value: CardInfo) => void;
};

export function CardFormPanel({ value, errors, onChange }: CardFormPanelProps) {
  const inputClass = (hasError: boolean) =>
    `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-coffee-900 outline-none transition focus:border-coffee-700 ${
      hasError ? 'border-rose-400' : 'border-coffee-200'
    }`;

  return (
    <div className="mt-4 rounded-2xl border border-coffee-100 bg-cream/30 p-4">
      <p className="text-sm font-semibold text-coffee-900">Thông tin thẻ</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="cardNumber" className="block text-xs font-semibold text-coffee-700">
            Số thẻ
          </label>
          <input
            id="cardNumber"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={value.number}
            onChange={(event) =>
              onChange({ ...value, number: formatCardNumber(event.target.value) })
            }
            className={inputClass(Boolean(errors.number))}
          />
          {errors.number && <p className="mt-1 text-xs text-rose-600">{errors.number}</p>}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="cardHolder" className="block text-xs font-semibold text-coffee-700">
            Tên chủ thẻ
          </label>
          <input
            id="cardHolder"
            type="text"
            autoComplete="cc-name"
            placeholder="NGUYEN VAN A"
            value={value.holderName}
            onChange={(event) => onChange({ ...value, holderName: event.target.value })}
            className={inputClass(Boolean(errors.holderName))}
          />
          {errors.holderName && (
            <p className="mt-1 text-xs text-rose-600">{errors.holderName}</p>
          )}
        </div>

        <div>
          <label htmlFor="cardExpiry" className="block text-xs font-semibold text-coffee-700">
            Ngày hết hạn
          </label>
          <input
            id="cardExpiry"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={value.expiry}
            onChange={(event) => onChange({ ...value, expiry: formatExpiry(event.target.value) })}
            className={inputClass(Boolean(errors.expiry))}
          />
          {errors.expiry && <p className="mt-1 text-xs text-rose-600">{errors.expiry}</p>}
        </div>

        <div>
          <label htmlFor="cardCvv" className="block text-xs font-semibold text-coffee-700">
            CVV
          </label>
          <input
            id="cardCvv"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            maxLength={4}
            value={value.cvv}
            onChange={(event) =>
              onChange({ ...value, cvv: event.target.value.replace(/\D/g, '').slice(0, 4) })
            }
            className={inputClass(Boolean(errors.cvv))}
          />
          {errors.cvv && <p className="mt-1 text-xs text-rose-600">{errors.cvv}</p>}
        </div>
      </div>
    </div>
  );
}
