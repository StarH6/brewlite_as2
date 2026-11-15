import { test, expect } from './fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import {
  verifyDatabaseConnection,
  findOrderByCode,
  disconnectPrisma,
} from '../../api/e2e/prisma-reader';

test.beforeAll(async () => {
  await verifyDatabaseConnection();
});

test.afterAll(async () => {
  await disconnectPrisma();
});

// Menu -> chọn món -> thêm giỏ -> checkout
async function goToCheckout(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Mua Cà phê sữa đá' }).click();

  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
  await expect(
    page.getByRole('heading', { name: 'Giỏ hàng của bạn' }),
  ).toBeVisible();

  const orderButton = page.getByRole('button', { name: 'Đặt hàng ngay' });
  await expect(orderButton).toBeEnabled();
  await orderButton.click();

  await expect(page).toHaveURL(/\/checkout/);
  await expect(
    page.getByRole('heading', { name: 'Thanh toán đơn hàng' }),
  ).toBeVisible();
}

// Bật "mô phỏng thất bại" -> kiểm tra QR -> xác nhận -> màn hình thất bại
async function payAndFail(page: Page) {
  await page.getByLabel('Mô phỏng thanh toán thất bại').check();
  await page.getByRole('button', { name: 'Kiểm tra giao dịch' }).click();

  const confirmButton = page.getByRole('button', { name: /Xác nhận đơn hàng/ });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(
    page.getByRole('heading', { name: 'Thanh toán thất bại' }),
  ).toBeVisible();
  await expect(page.getByText('Giao dịch thất bại')).toBeVisible();
}

test('Thanh toán thất bại: hiện màn hình lỗi, đơn không được PAID', async ({
  authenticatedPage: page,
}) => {
  await goToCheckout(page);
  await payAndFail(page);

  // Màn hình thất bại có đủ thông tin và nút xử lý tiếp
  await expect(page.getByText('Ví điện tử (QR)')).toBeVisible();
  await expect(
    page.getByText('Giao dịch bị từ chối hoặc chưa được xác nhận thanh toán.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Thử thanh toán lại' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Hủy đơn hàng' }),
  ).toBeVisible();

  // Mã đơn trên UI
  const orderCode = (await page.locator('span.font-mono').first().textContent())?.trim();
  expect(orderCode).toBeTruthy();

  // Đối chiếu DB: đơn chưa thanh toán
  const order = await findOrderByCode(orderCode!);
  expect(order).not.toBeNull();
  expect(order!.status).toBe('PAYMENT_FAILED');
  expect(order!.payments).toHaveLength(1);
  expect(order!.payments[0].status).not.toBe('PAID');

  // Giỏ hàng KHÔNG bị xóa khi thanh toán thất bại
  await page.getByRole('button', { name: 'Thử thanh toán lại' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thanh toán đơn hàng' }),
  ).toBeVisible();
});

test('Hủy đơn sau khi thanh toán thất bại', async ({
  authenticatedPage: page,
}) => {
  await goToCheckout(page);
  await payAndFail(page);

  const orderCode = (await page.locator('span.font-mono').first().textContent())?.trim();
  expect(orderCode).toBeTruthy();

  // Hủy đơn (có bước xác nhận)
  await page.getByRole('button', { name: 'Hủy đơn hàng' }).click();
  await expect(
    page.getByText('Bạn chắc chắn muốn hủy đơn hàng này?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Đồng ý hủy' }).click();

  // Màn hình đã hủy
  await expect(
    page.getByRole('heading', { name: 'Đã hủy đơn hàng' }),
  ).toBeVisible();
  await expect(page.getByText('Đơn hàng đã hủy')).toBeVisible();
  await expect(page.locator('span.font-mono').first()).toHaveText(orderCode!);
  await expect(page.getByRole('link', { name: 'Về giỏ hàng' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem đơn hàng' })).toBeVisible();

  // Đối chiếu DB
  const order = await findOrderByCode(orderCode!);
  expect(order).not.toBeNull();
  expect(order!.status).toBe('CANCELLED');
});