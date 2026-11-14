# ADR-005: Thanh toán mô phỏng trong PaymentsService

**Trạng thái:** Accepted

## Bối cảnh

Task cần minh họa thanh toán thành công/thất bại nhưng không cần cổng thanh toán thật, không muốn phát sinh giao dịch tiền.

## Quyết định

Dùng **mock payment nội bộ NestJS** khi `PAYMENT_PROVIDER=mock` (mặc định). `apps/api/src/payments/payments.service.ts` xử lý kết quả, lưu Payment và thay đổi trạng thái Order qua `OrderStateMachine`; sử dụng `Idempotency-Key` để hạn chế thanh toán trùng. Demo thất bại dùng `simulateFailure` ngoài production.

## Lý do / ưu điểm

Nhanh, dễ kiểm thử, không phụ thuộc dịch vụ bên ngoài, đủ trình bày luồng đặt đơn → thanh toán → cập nhật trạng thái.

## Hạn chế / trade-off

Không mô phỏng đầy đủ lỗi mạng/webhook; chưa có `MockPaymentGateway` class độc lập hoặc job đối soát. Đây là **logic trong API**, không phải một server thanh toán riêng.
