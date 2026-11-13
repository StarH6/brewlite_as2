# ADR-005: PaymentGateway port + MockPaymentGateway adapter

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: hiện thực rút gọn (chưa có port/adapter, job đối soát). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: FR-06, FR-08, FR-10, NFR-05, RSK-02, RSK-03

## Bối cảnh

Đồ án không có merchant account/secret thật, nhưng cần demo end-to-end thành công/thất bại và chứng minh idempotency, transaction, trạng thái đơn. Task 2 đã mô tả `PaymentGateway` trong class diagram và "Mock Gateway" trong sequence diagram.

## Các lựa chọn đã cân nhắc

1. **Port `PaymentGateway` + adapter `MockPaymentGateway` trong NestJS**, chọn qua DI token.
2. Mock trực tiếp trong `PaymentsService`/`OrdersService`.
3. Tách mock payment thành service/container riêng.
4. Tích hợp gateway sandbox thật (MoMo/VNPay/Stripe).

## Quyết định

Chọn phương án **1**:

- Interface `PaymentGateway` gồm `createPayment(orderId, amount, method)` và `verifyResult(transactionReference?, idempotencyKey)`; `verifyCallback(rawBody, signature)` dành cho Extended/webhook. Nếu timeout trước khi có reference, job đối soát dùng key.
- `MockPaymentGateway` chạy **trong process** API; cấu hình delay/tỷ lệ lỗi; trả `transactionReference` dạng `mock_<orderId>_<uuid>`.
- `PaymentsModule` bind `PAYMENT_PROVIDER` → `MockPaymentGateway`.
- Gateway chỉ được gọi **sau khi** reservation `Payment = PROCESSING` đã commit (FR-06).
- Timeout chưa xác minh: giữ `PROCESSING`, đơn `PENDING`; `PaymentReconciliationJob` dùng `verifyResult` để chốt `PAID`/`FAILED`/`EXPIRED`.
- Gateway thật sau này chỉ cần implement lại interface, không đổi controller/order flow.

## Hệ quả

**Tích cực**

- Không rủi ro tiền thật, không lưu dữ liệu thẻ.
- Dễ test success/failure/timeout bằng cấu hình.
- Ranh giới rõ để thay gateway thật; không thêm service mạng trong MVP.
- Hỗ trợ đúng các trạng thái `PaymentStatus` đã đặc tả.

**Tiêu cực**

- Không mô phỏng đầy đủ webhook, chữ ký, độ trễ mạng thật.
- `verifyResult`/job đối soát là đường phức tạp, cần test kỹ.
- Nếu gateway thật có API khác, có thể phải mở rộng interface.

**Điều kiện khi tích hợp thật**

- Xác thực callback bằng HMAC-SHA256 + timestamp + chống replay.
- Không log dữ liệu nhạy cảm; secret ở dashboard.
- Callback hợp lệ vẫn phải đi qua `assertTransition` của FR-08.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Hiện thực một phần – đơn giản hơn thiết kế
- **Đã có**: thanh toán mô phỏng trong `apps/api/src/payments/payments.service.ts`; chọn provider bằng biến `PAYMENT_PROVIDER` (mặc định `mock`, giá trị khác → `503`); `transactionReference` dạng `MOCK-<timestamp>-<random>`; cờ `simulateFailure` để demo thất bại (bị từ chối ở production); idempotency theo unique `(userId, orderId, idempotencyKey)` + xử lý race `P2002`/`409`; mọi chuyển trạng thái đơn đều qua `OrderStateMachine.assertTransition`.
- **Chưa có**: interface `PaymentGateway`, class `MockPaymentGateway`, DI token, `PaymentReconciliationJob`, trạng thái `PROCESSING`/`EXPIRED` (enum hiện là `INITIATED`/`PAID`/`FAILED`), `verifyResult`/`verifyCallback`.
- **Lý do chấp nhận lệch**: mock chạy tức thời, không có timeout "chưa xác minh" nên reservation + đối soát chưa cần; port/adapter chỉ thực sự cần khi tích hợp gateway thật.
- **Việc cần làm nếu muốn khớp ADR**: tách `PaymentGateway` + `MockPaymentGateway` khỏi `PaymentsService`; hoặc ghi ADR mới "Payment mock tích hợp trong service" và đánh dấu ADR-005 Superseded.
