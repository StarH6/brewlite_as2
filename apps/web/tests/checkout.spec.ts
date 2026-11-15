import { test, expect } from './fixtures/auth.fixture';
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

test('Khách hàng đặt món và thanh toán MOCK thành công', async ({
  authenticatedPage: page,
}) => {
  // 1. Menu -> chọn món
  await page.goto('/');
  await page.getByRole('link', { name: 'Mua Cà phê sữa đá' }).click();

  // 2. Thêm vào giỏ
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
  await expect(
    page.getByRole('heading', { name: 'Giỏ hàng của bạn' }),
  ).toBeVisible();

// 3. Đặt hàng -> checkout
const orderButton = page.getByRole('button', { name: 'Đặt hàng ngay' });
await expect(orderButton).toBeVisible();
await expect(orderButton).toBeEnabled();
await orderButton.click();

await expect(page).toHaveURL(/\/checkout/);

  // 4. QR MOCK (WALLET là mặc định)
  await page.getByRole('button', { name: 'Kiểm tra giao dịch' }).click();

  // 5. Xác nhận đơn hàng
  const confirmButton = page.getByRole('button', { name: /Xác nhận đơn hàng/ });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // 6. Màn hình xác nhận (vẫn ở /checkout)
  await expect(
    page.getByRole('heading', { name: 'Cảm ơn bạn đã đặt món' }),
  ).toBeVisible();
  await expect(page.getByText('Giao dịch thành công')).toBeVisible();
  await expect(page.getByText('Ví điện tử (QR)')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Tiếp tục chọn đồ uống' }),
  ).toBeVisible();

  // 7. Mã đơn trên UI
  const orderCodeLocator = page.getByTestId('order-code');
  await expect(orderCodeLocator).toBeVisible();

  const orderCode = (await orderCodeLocator.textContent())?.trim();
  expect(orderCode).toBeTruthy();

  // 8. Đối chiếu DB
  const order = await findOrderByCode(orderCode!);
  expect(order).not.toBeNull();
  expect(order!.status).toBe('PAID');
  expect(order!.items).toHaveLength(1);
  expect(order!.payments[0].status).toBe('PAID');
});