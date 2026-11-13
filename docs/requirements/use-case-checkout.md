# Đặc tả Use Case: Đặt và thanh toán đơn hàng

## 1. Thông tin Use Case
* **Tên Use Case**: Đặt và thanh toán đơn hàng (gồm Tạo đơn hàng – Thanh toán đơn hàng)
* **Mã định danh**: `UC-07` (Tạo đơn hàng), `UC-08` (Thanh toán đơn hàng)
* **Mức độ ưu tiên**: **Must Have**
* **Actor chính**: Khách hàng (Customer)
* **Actor hỗ trợ**: Cổng thanh toán (Mock Payment Gateway – mô phỏng, chạy trong API)

---

## 2. Tóm tắt nghiệp vụ
Khách hàng đã đăng nhập chọn đồ uống, đặt hàng từ giỏ hàng rồi thanh toán bằng ví điện tử hoặc thẻ ngân hàng mô phỏng. Hệ thống kiểm tra tồn kho, tính tiền phía server, tạo đơn `PENDING`, sau đó xử lý thanh toán và cập nhật trạng thái đơn theo kết quả.

Mỗi yêu cầu thanh toán mang một `Idempotency-Key` để tránh xử lý lặp khi khách bấm hai lần hoặc mạng được gửi lại. Nếu thanh toán thất bại, khách hàng có thể thanh toán lại trên **đơn cũ** (không tạo đơn mới).

---

## 3. Sơ đồ Use Case

![Sơ đồ Use Case Đặt và thanh toán đơn hàng](./use-case-checkout.svg)

Nguồn sơ đồ: [`use-case-checkout.puml`](./use-case-checkout.puml).

| Quan hệ | Use case | Ý nghĩa |
| :--- | :--- | :--- |
| `<<include>>` | Xác thực JWT & validate dữ liệu | Bước bắt buộc của mọi yêu cầu |
| `<<include>>` | Tạo đơn hàng | Kiểm tra và trừ tồn kho trong transaction, tính tiền ở server |
| `<<include>>` | Thanh toán đơn hàng | Chọn phương thức, kiểm tra đơn và Idempotency-Key, thanh toán, cập nhật Payment/Order |
| `<<extend>>` | Áp dụng mã khuyến mãi | Chỉ khi khách nhập `promoCode` lúc tạo đơn |
| `<<extend>>` | Thanh toán lại | Chỉ khi đơn đang `PAYMENT_FAILED` |
| `<<extend>>` | Hủy đơn (hoàn tồn kho) | Chỉ khi đơn `PENDING` hoặc `PAYMENT_FAILED` |
| `<<extend>>` | Cộng điểm tích lũy | Chỉ khi thanh toán thành công (`PAID`) |

---

## 4. Trigger
* Tạo đơn: khách nhấn **"Đặt hàng"** tại giỏ hàng.
* Thanh toán: khách nhấn **"Xác nhận thanh toán"** tại màn hình thanh toán.

---

## 5. Tiền điều kiện (Pre-conditions)
1. Khách hàng đã đăng nhập và có JWT hợp lệ.
2. Giỏ hàng có ít nhất một món; các món còn mở bán và đủ tồn kho.
3. Khi thanh toán: đơn tồn tại, thuộc khách hàng, đang ở trạng thái `PENDING` hoặc `PAYMENT_FAILED`.
4. Dịch vụ thanh toán mô phỏng sẵn sàng (`PAYMENT_PROVIDER=mock`).

---

## 6. Hậu điều kiện (Post-conditions)

### 6.1. Thành công
* Đơn hàng được tạo, tồn kho đã trừ, giá được lưu snapshot.
* Bản ghi `Payment` có trạng thái `PAID`, có `transactionReference` dạng `MOCK-...`.
* Đơn hàng chuyển `PENDING → PAID`.
* Khách được cộng điểm tích lũy (idempotent theo `orderId`).

### 6.2. Thanh toán thất bại
* Bản ghi `Payment` có trạng thái `FAILED`; đơn chuyển `PAYMENT_FAILED`.
* Tồn kho **vẫn đang giữ** cho đơn; khách có thể thanh toán lại hoặc hủy đơn để hoàn kho.

### 6.3. Lỗi trước khi thanh toán (hết hàng, dữ liệu sai)
* Không tạo đơn, không trừ tồn kho, không có `Payment`.

---

## 7. Luồng sự kiện chính (Main Flow)

| Bước | Hành động của Khách hàng | Phản hồi của Hệ thống |
| :---: | :--- | :--- |
| 1 | Chọn đồ uống, size, topping, thêm vào giỏ; (tùy chọn) nhập mã khuyến mãi. | Giỏ hàng lưu ở client (Zustand). |
| 2 | Nhấn **"Đặt hàng"**. | Gửi `POST /orders` kèm JWT. |
| 3 | | Xác thực JWT, validate dữ liệu (`whitelist`). |
| 4 | | Trong một transaction `Serializable`: kiểm tra món còn bán, trừ tồn kho có điều kiện, tính tiền và áp mã khuyến mãi ở server, tạo đơn `PENDING`. |
| 5 | Mở màn hình thanh toán, chọn phương thức (**Ví điện tử** hoặc **Thẻ ngân hàng**). | Hiển thị mã đơn, tổng tiền; bật nút "Xác nhận thanh toán". |
| 6 | Nhấn **"Xác nhận thanh toán"**. | Tạo `Idempotency-Key`, gửi `POST /payments` (`orderId`, `method`) kèm header `Idempotency-Key`. |
| 7 | | Kiểm tra đơn tồn tại và đang `PENDING`/`PAYMENT_FAILED`; tra `Payment` theo `(userId, orderId, idempotencyKey)` để chặn xử lý lặp. |
| 8 | | Gọi mô phỏng cổng thanh toán, nhận kết quả thành công. |
| 9 | | Trong một transaction: đổi đơn `PENDING → PAID` bằng `updateMany` có điều kiện (chỉ một request thắng) và ghi `Payment = PAID`. |
| 10 | | Sau khi commit: cộng điểm tích lũy cho khách. |
| 11 | Xem kết quả thanh toán và theo dõi đơn hàng. | Trả `payment`, `orderStatus = PAID`; trang "Đơn hàng của tôi" hiển thị trạng thái mới. |

---

## 8. Luồng thay thế (Alternative Flows)

### 8.1. AF-1: Áp dụng mã khuyến mãi (tại bước 1–4)
* Khách nhập `promoCode`. Server kiểm tra mã hợp lệ, còn hạn, đủ điều kiện và giới hạn lượt dùng, rồi tính `discount = min(giảm cấu hình, giảm tối đa, tạm tính)`. Tổng tiền không dựa vào số client gửi.

### 8.2. AF-2: Đổi phương thức thanh toán (tại bước 5)
* Khách chuyển giữa Ví điện tử và Thẻ ngân hàng; số tiền đơn không đổi.

### 8.3. AF-3: Thanh toán lại đơn `PAYMENT_FAILED`
* Khách bấm thanh toán lại với `Idempotency-Key` **mới**. Hệ thống đổi đơn `PAYMENT_FAILED → PENDING → PAID` (hoặc `PAYMENT_FAILED`) trên **đơn cũ**, mọi chuyển trạng thái đều qua `OrderStateMachine`.

### 8.4. AF-4: Hủy đơn
* Khách hủy đơn `PENDING`/`PAYMENT_FAILED`: đơn chuyển `CANCELLED`, tồn kho được hoàn lại. Đơn đã `PAID` chỉ nhân viên (STAFF) mới hủy được; khi đó hệ thống hoàn kho và thu hồi điểm đã cộng.

---

## 9. Luồng ngoại lệ (Exception Flows)

| Mã | Tình huống | Hệ thống xử lý |
| :--- | :--- | :--- |
| EF-1 | JWT thiếu hoặc hết hạn | `401 Unauthorized`; yêu cầu đăng nhập lại. |
| EF-2 | Giỏ hàng trống, món không tồn tại hoặc ngừng bán, mã khuyến mãi không hợp lệ | `400 Bad Request`; không tạo đơn. |
| EF-3 | Hết hàng hoặc xung đột khi nhiều người cùng đặt | Transaction rollback, báo món hết hàng/xung đột; không trừ kho (có thử lại tối đa vài lần khi xung đột phiên bản). |
| EF-4 | Đơn không tồn tại | `404 Not Found`. |
| EF-5 | Đơn không ở trạng thái `PENDING`/`PAYMENT_FAILED` (đã `PAID`, `CANCELLED`...) | `409 Conflict`; không thanh toán. |
| EF-6 | Thiếu hoặc sai `Idempotency-Key` (quá 64 ký tự, header và body khác nhau) | `400 Bad Request`. |
| EF-7 | Thanh toán thất bại (mô phỏng) | Lưu `Payment = FAILED`, đơn `PAYMENT_FAILED`; khách được thanh toán lại. |
| EF-8 | Gửi lặp cùng `Idempotency-Key` | Trả kết quả đã lưu (`reused: true`); không tạo `Payment` mới. |
| EF-9 | Hai request đồng thời cho cùng đơn | Một request thắng; request thua nhận kết quả đã lưu hoặc `409`; không trừ tiền hai lần. |
| EF-10 | Lỗi cộng điểm sau khi đã thanh toán | Không rollback thanh toán; ghi nhận để xử lý sau. |
| EF-11 | `PAYMENT_PROVIDER` khác `mock` | `503 Service Unavailable`. |

---

## 10. Quy tắc nghiệp vụ
* **BR-1**: Tổng tiền luôn do server tính; bỏ qua số tiền client gửi.
* **BR-2**: Mỗi đơn chỉ được thanh toán thành công một lần.
* **BR-3**: Mọi chuyển trạng thái đơn phải được `OrderStateMachine` cho phép.
* **BR-4**: Chỉ cộng điểm tích lũy sau khi thanh toán đã commit.
* **BR-5**: Không mô phỏng thất bại (`simulateFailure`) ở môi trường production.

---

## 11. Truy vết yêu cầu và mã nguồn
| Yêu cầu | Nội dung | Mã nguồn |
| :--- | :--- | :--- |
| FR-05 | Tạo đơn trước khi thanh toán | `apps/api/src/orders/orders.service.ts` |
| FR-06 | Thanh toán, lưu kết quả, thử lại an toàn | `apps/api/src/payments/payments.service.ts`, `payments.controller.ts` |
| FR-08 | Kiểm soát chuyển trạng thái đơn | `apps/api/src/orders/domain/order-state-machine.ts` |
| FR-09 | Mã khuyến mãi | `apps/api/src/promotions/` |
| FR-10 | Điểm tích lũy | `apps/api/src/loyalty/` |
| NFR-02 | JWT, validate dữ liệu | `apps/api/src/auth/`, `apps/api/src/main.ts` |
| NFR-05 | Transaction và idempotency | `orders.concurrency.e2e.spec.ts`, `payments.idempotency.e2e.spec.ts` |
