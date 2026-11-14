const LOCAL_DATABASE_URL =
  'postgresql://brewlite:brewlite_local_only@127.0.0.1:5432/brewlite?schema=public';
const LOCAL_JWT_SECRET = 'local-only-jwt-secret-at-least-32-characters';
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Validate cấu hình lúc khởi động (ADR-007).
 * Local/dev có default an toàn để `start:dev` vẫn trả GET / khi DB chưa chạy;
 * production bắt buộc phải cung cấp DATABASE_URL và JWT_SECRET riêng.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = readString(config.NODE_ENV) ?? 'development';
  const isProduction = nodeEnv === 'production';
  const port = Number(config.PORT ?? 3000);

  const databaseUrl =
    readString(config.DATABASE_URL) ?? (isProduction ? '' : LOCAL_DATABASE_URL);
  const jwtSecret = readString(config.JWT_SECRET) ?? (isProduction ? '' : LOCAL_JWT_SECRET);
  const corsOrigin =
    readString(config.CORS_ORIGIN) ?? 'http://localhost:3001,http://127.0.0.1:3001';
  const logLevel = readString(config.LOG_LEVEL) ?? 'info';
  const paymentProvider = readString(config.PAYMENT_PROVIDER) ?? 'mock';
  const orderPaymentTimeoutSeconds = Number(
    readString(config.ORDER_PAYMENT_TIMEOUT_SECONDS) ?? 900,
  );
  const vnpayPayUrl = readString(config.VNPAY_PAY_URL) ??
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const webBaseUrl = readString(config.WEB_BASE_URL) ?? 'http://localhost:3001';

  const errors: string[] = [];
  if (!['mock', 'vnpay'].includes(paymentProvider)) {
    errors.push('PAYMENT_PROVIDER phải là mock hoặc vnpay.');
  }

  if (paymentProvider === 'vnpay') {
    for (const key of ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_RETURN_URL']) {
      const value = readString(config[key]);
      if (!value || /[<>]/.test(value)) errors.push(`${key} là bắt buộc khi dùng VNPay (không dùng giá trị mẫu).`);
    }
    if (!/^[a-zA-Z0-9]{8}$/.test(readString(config.VNPAY_TMN_CODE) ?? '')) {
      errors.push('VNPAY_TMN_CODE phải gồm 8 ký tự chữ/số.');
    }
    for (const [key, value] of [
      ['VNPAY_RETURN_URL', readString(config.VNPAY_RETURN_URL)],
      ['WEB_BASE_URL', webBaseUrl],
    ]) {
      try {
        const url = new URL(value ?? '');
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
          throw new Error();
        }
      } catch {
        errors.push(`${key} phải là URL HTTP(S) hợp lệ, không chứa thông tin đăng nhập/query/hash.`);
      }
    }
    try {
      const url = new URL(vnpayPayUrl);
      if (
        url.protocol !== 'https:' || url.hostname !== 'sandbox.vnpayment.vn' ||
        url.pathname !== '/paymentv2/vpcpay.html' || url.port ||
        url.username || url.password || url.search || url.hash
      ) throw new Error();
    } catch {
      errors.push('VNPAY_PAY_URL phải trỏ tới cổng VNPay Sandbox HTTPS.');
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT phải là số nguyên trong khoảng 1..65535.');
  }

  if (!databaseUrl) {
    errors.push('DATABASE_URL là bắt buộc ở production.');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL phải là URL PostgreSQL (postgresql://...).');
  }

  if (!jwtSecret) {
    errors.push('JWT_SECRET là bắt buộc ở production.');
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET phải có tối thiểu 32 ký tự.');
  } else if (isProduction && jwtSecret === LOCAL_JWT_SECRET) {
    errors.push('JWT_SECRET không được dùng giá trị local ở production.');
  }

  if (!corsOrigin) {
    errors.push('CORS_ORIGIN không được để trống.');
  }

  if (!LOG_LEVELS.includes(logLevel as (typeof LOG_LEVELS)[number])) {
    errors.push(`LOG_LEVEL phải là một trong: ${LOG_LEVELS.join(', ')}.`);
  }

  if (
    !Number.isInteger(orderPaymentTimeoutSeconds) ||
    orderPaymentTimeoutSeconds < 1
  ) {
    errors.push('ORDER_PAYMENT_TIMEOUT_SECONDS phải là số nguyên dương (giây).');
  }

  if (errors.length > 0) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n- ${errors.join('\n- ')}`);
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
    LOG_LEVEL: logLevel,
    PAYMENT_PROVIDER: paymentProvider,
    VNPAY_TMN_CODE: readString(config.VNPAY_TMN_CODE),
    VNPAY_HASH_SECRET: readString(config.VNPAY_HASH_SECRET),
    VNPAY_RETURN_URL: readString(config.VNPAY_RETURN_URL),
    VNPAY_PAY_URL: vnpayPayUrl,
    WEB_BASE_URL: webBaseUrl,
    ORDER_PAYMENT_TIMEOUT_SECONDS: orderPaymentTimeoutSeconds,
  };
}
