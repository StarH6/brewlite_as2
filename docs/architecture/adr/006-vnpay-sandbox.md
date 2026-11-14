
# ADR-006: Tích hợp VNPay Sandbox

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-14
- **Liên quan:** ADR-005 – Mock Payment

## 1. Bối cảnh

BrewLite là hệ thống đặt đồ uống trực tuyến, cần hỗ trợ thanh toán không dùng tiền mặt.

Hệ thống đã có chức năng thanh toán mô phỏng (Mock Payment). Tuy nhiên, nhóm muốn bổ sung VNPay Sandbox để mô phỏng quy trình thanh toán qua cổng bên ngoài.

## 2. Các phương án

1. **Chỉ sử dụng Mock Payment:** Đơn giản, dễ kiểm thử nhưng chưa mô phỏng được hoàn toàn quy trình thanh toán qua cổng bên ngoài.
2. **Sử dụng VNPay Sandbox:** Có thể trải nghiệm quy trình chuyển hướng và xác nhận thanh toán.
3. **Tích hợp thanh toán thật:** Phức tạp, cần tài khoản merchant và có rủi ro phát sinh giao dịch thực tế.

## 3. Quyết định

Nhóm chọn **VNPay Sandbox**, đồng thời cũng giữ Mock Payment để phục vụ kiểm thử.

- Sử dụng `PAYMENT_PROVIDER=mock` cho thanh toán mô phỏng.
- Sử dụng `PAYMENT_PROVIDER=vnpay` để bật VNPay Sandbox.
- Backend NestJS tạo URL thanh toán và frontend Next.js chuyển hướng người dùng đến VNPay.
- Sau khi thanh toán, VNPay chuyển trình duyệt về endpoint `/payments/vnpay/return`.
- Backend xác minh chữ ký HMAC-SHA512 và thông tin giao dịch trước khi cập nhật trạng thái thanh toán.
- Các thông tin như `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` và `VNPAY_RETURN_URL` được quản lý bằng biến môi trường.
- Không lưu trữ thông tin thẻ ngân hàng của khách hàng.

## 4. Ưu điểm

- Mô phỏng được quy trình thanh toán gần với thực tế.
- Không phát sinh giao dịch tiền thật.
- Tích hợp trực tiếp vào `PaymentsModule` của NestJS.
- Có thể chuyển đổi giữa Mock Payment và VNPay Sandbox.
- Có cơ chế xác minh chữ ký và kiểm tra trạng thái giao dịch.

## 5. Hạn chế và trade-off

- Phụ thuộc vào môi trường VNPay Sandbox và kết nối Internet.
- Cần cấu hình thông tin merchant sandbox.
- Nếu người dùng đóng trình duyệt trước khi quay về hệ thống, kết quả thanh toán có thể chưa được xác nhận.
- Chưa phù hợp cho môi trường thanh toán production.

## 6. Kết luận

Nhóm quyết định sử dụng **VNPay Sandbox** kết hợp với Mock Payment.

Phương án này đáp ứng nhu cầu mô phỏng thanh toán thực tế, dễ triển khai và phù hợp với quy mô đồ án BrewLite.
