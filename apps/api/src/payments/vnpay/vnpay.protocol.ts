import { createHmac, timingSafeEqual } from 'node:crypto';

export type VnpayParameters = Record<string, string>;

export function encodeVnpayParameters(parameters: VnpayParameters): string {
  return Object.keys(parameters)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key]).replace(/%20/g, '+')}`)
    .join('&');
}

export function signVnpayParameters(parameters: VnpayParameters, secret: string): string {
  return createHmac('sha512', secret)
    .update(encodeVnpayParameters(parameters), 'utf8')
    .digest('hex');
}

/** Reject duplicate/nested query values before constructing the signed payload. */
export function verifyVnpaySignature(query: Record<string, unknown>, secret: string): VnpayParameters {
  const parameters: VnpayParameters = {};
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('vnp_')) continue;
    if (typeof value !== 'string' || value.length > 2048) {
      throw new Error('Tham số VNPay không hợp lệ.');
    }
    parameters[key] = value;
  }
  const hash = parameters.vnp_SecureHash;
  delete parameters.vnp_SecureHash;
  delete parameters.vnp_SecureHashType;
  if (
    !hash || !/^[a-fA-F0-9]{128}$/.test(hash) ||
    !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signVnpayParameters(parameters, secret), 'hex'))
  ) {
    throw new Error('Chữ ký VNPay không hợp lệ.');
  }
  return parameters;
}

/** Always GMT+7, independently of the host/container timezone. */
export function formatVnpayDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace(/[-T:]/g, '');
}

export function parseVnpayDate(value: string): Date {
  if (!/^\d{14}$/.test(value)) throw new Error('Thời điểm thanh toán VNPay không hợp lệ.');
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+07:00`,
  );
  if (!Number.isFinite(date.getTime()) || formatVnpayDate(date) !== value) {
    throw new Error('Thời điểm thanh toán VNPay không hợp lệ.');
  }
  return date;
}
