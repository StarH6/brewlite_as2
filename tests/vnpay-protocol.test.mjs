// Dependency-free smoke tests; Node >=22.13. No pnpm/npm install required.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

async function loadTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const protocol = await loadTypeScript('../apps/api/src/payments/vnpay/vnpay.protocol.ts');
const { validateEnv } = await loadTypeScript('../apps/api/src/config/env.validation.ts');
const secret = 'sandbox-test-secret-not-a-real-merchant';
const payload = {
  vnp_TmnCode: 'TEST1234',
  vnp_TxnRef: 'abc123',
  vnp_Amount: '4500000',
  vnp_OrderInfo: 'Thanh toan BrewLite TEST 1',
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
};
const signed = { ...payload, vnp_SecureHash: protocol.signVnpayParameters(payload, secret) };
const validEnv = {
  PAYMENT_PROVIDER: 'vnpay',
  VNPAY_TMN_CODE: 'TEST1234',
  VNPAY_HASH_SECRET: secret,
  VNPAY_RETURN_URL: 'http://localhost:3000/payments/vnpay/return',
};

test('canonical encoding sorts keys, escapes URLs and encodes spaces as +', () => {
  assert.equal(protocol.encodeVnpayParameters({
    vnp_ReturnUrl: 'http://localhost:3000/payments/vnpay/return',
    vnp_OrderInfo: 'Thanh toan A+B',
    vnp_Amount: '4500000',
  }), 'vnp_Amount=4500000&vnp_OrderInfo=Thanh+toan+A%2BB&vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A3000%2Fpayments%2Fvnpay%2Freturn');
});

test('HMAC matches an independently specified canonical string', () => {
  const expected = createHmac('sha512', secret).update(
    'vnp_Amount=4500000&vnp_OrderInfo=Thanh+toan+BrewLite+TEST+1&vnp_ResponseCode=00&vnp_TmnCode=TEST1234&vnp_TransactionStatus=00&vnp_TxnRef=abc123',
  ).digest('hex');
  assert.equal(signed.vnp_SecureHash, expected);
});

test('a valid signed callback verifies without mutating its query', () => {
  assert.deepEqual(protocol.verifyVnpaySignature(signed, secret), payload);
  assert.equal(typeof signed.vnp_SecureHash, 'string');
});

test('URL encode/decode round-trip preserves the signature', () => {
  const query = Object.fromEntries(new URLSearchParams(protocol.encodeVnpayParameters(signed)));
  assert.deepEqual(protocol.verifyVnpaySignature(query, secret), payload);
});

test('tampered amount is rejected', () => {
  assert.throws(() => protocol.verifyVnpaySignature({ ...signed, vnp_Amount: '100' }, secret));
});

test('wrong secret is rejected', () => {
  assert.throws(() => protocol.verifyVnpaySignature(signed, 'wrong-secret'));
});

test('missing, truncated and non-hex signatures are rejected', () => {
  for (const hash of [undefined, '', 'a', 'z'.repeat(128)]) {
    assert.throws(() => protocol.verifyVnpaySignature({ ...signed, vnp_SecureHash: hash }, secret));
  }
});

test('duplicate and nested query values are rejected', () => {
  assert.throws(() => protocol.verifyVnpaySignature({ ...signed, vnp_Amount: ['4500000', '100'] }, secret));
  assert.throws(() => protocol.verifyVnpaySignature({ ...signed, vnp_Amount: { value: '4500000' } }, secret));
});

test('oversized fields are rejected', () => {
  assert.throws(() => protocol.verifyVnpaySignature({ ...signed, vnp_OrderInfo: 'a'.repeat(2049) }, secret));
});

test('non-VNPay parameters cannot influence signed payment data', () => {
  assert.deepEqual(protocol.verifyVnpaySignature({ ...signed, success: 'true' }, secret), payload);
});

test('timezone formatting crosses UTC dates correctly', () => {
  assert.equal(protocol.formatVnpayDate(new Date('2026-11-14T18:04:05Z')), '20261115010405');
  assert.equal(protocol.parseVnpayDate('20261115010405').toISOString(), '2026-11-14T18:04:05.000Z');
});

test('invalid dates are rejected', () => {
  for (const date of ['20260230000000', '20261301000000', '20260101250000', 'bad', '']) {
    assert.throws(() => protocol.parseVnpayDate(date));
  }
});

test('mock remains the default and does not require VNPay credentials', () => {
  assert.equal(validateEnv({}).PAYMENT_PROVIDER, 'mock');
});

test('sandbox configuration accepts localhost Return URL without IPN', () => {
  const result = validateEnv(validEnv);
  assert.equal(result.PAYMENT_PROVIDER, 'vnpay');
  assert.equal(result.VNPAY_PAY_URL, 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
});

test('VNPay fails fast for missing credentials and example placeholders', () => {
  for (const key of ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_RETURN_URL']) {
    assert.throws(() => validateEnv({ ...validEnv, [key]: '' }));
    assert.throws(() => validateEnv({ ...validEnv, [key]: '<placeholder>' }));
  }
});

test('unsupported provider, invalid merchant, unsafe redirects and production gateway are rejected', () => {
  for (const patch of [
    { PAYMENT_PROVIDER: 'other' },
    { VNPAY_TMN_CODE: 'bad' },
    { VNPAY_RETURN_URL: 'javascript:alert(1)' },
    { WEB_BASE_URL: 'http://user:password@localhost:3001' },
    { VNPAY_PAY_URL: 'https://pay.vnpay.vn/vpcpay.html' },
    { VNPAY_PAY_URL: 'https://sandbox.vnpayment.vn.evil.example/paymentv2/vpcpay.html' },
    { VNPAY_PAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?extra=1' },
  ]) assert.throws(() => validateEnv({ ...validEnv, ...patch }));
});
