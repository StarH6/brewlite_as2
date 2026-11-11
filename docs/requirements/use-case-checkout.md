# Thanh toán đơn hàng


## 1. Thông tin chung

| Thuộc tính | Nội dung |
|---|---|
| Tên | Thanh toán đơn hàng |
| Actor chính | Khách hàng |
| Mục tiêu | Thanh toán một đơn hàng bằng ví QR hoặc thẻ, nhận kết quả và tránh xử lý lặp (Chỉ là thanh toán mô phỏng) |

## 2. Sơ đồ Use Case

![Thanh toán đơn hàng](./use-case-checkout.svg)


## 3. Tiền điều kiện

1. Khách đã đăng nhập, phiên JWT hợp lệ. Backend chỉ chấp nhận thanh toán cho đơn thuộc của đúng chủ sở hữu.
2. Khách có món trong giỏ hàng và nhấn đặt hàng.
3. Đơn hàng được tạo thành công; đơn ở trạng thái `PENDING` hoặc `PAYMENT_FAILED`, không bị hủy và chưa quá hạn.

## 4. Trigger

Khách nhấn **Xác nhận thanh toán** ở trang thanh toán sau khi chọn phương thức và hoàn thành các kiểm tra tương ứng.

## 5. Luồng chính – Thanh toán thành công

| Bước | Khách hàng  | Hệ thống |
|---|---|---|
| 1 | Khách hàng xem giỏ hàng và số tiền cần trả dự kiến. |  |
| 2 | Chọn `WALLET` hoặc `CARD`. Với ví, bấm **Kiểm tra giao dịch** để xác nhận giả lập; với thẻ, nhập và xác thực dữ liệu thẻ. |  |
| 3 | Nhấn **Xác nhận thanh toán**. Nếu chưa có `pendingOrder`, frontend gọi `POST /orders` (có thể kèm mã giảm giá). | API tạo Order theo dữ liệu giỏ hàng; ghi `orderId`, `orderCode`, tổng tiền phía server; đơn ở trạng thái`PENDING`. |
| 4 |  Sinh `Idempotency-Key` rồi gọi `POST /payments`, gửi `orderId`, `method` và JWT. | API xác thực JWT và chủ đơn, kiểm tra DTO, đơn tồn tại, thời hạn và trạng thái đơn. |
| 5 | — | Tra cứu giao dịch có cùng `(userId, orderId, idempotencyKey)`; nếu chưa tồn tại thì tiếp tục. |
| 6 | — | Thanh toán thành công; trong transaction cập nhật Order `PENDING → PAID` (hoặc `PAYMENT_FAILED → PENDING → PAID` khi thử lại), lưu Payment `PAID` với số tiền từ Order. |
| 7 | — | Sau khi transaction thành công, hệ thống ghi điểm thưởng theo đơn. |
| 8 |  Nhận kết quả thành công, xóa giỏ và hiển thị mã đơn, số tiền, trạng thái. | Trả Payment, `orderStatus = PAID` và cờ `reused = false`. |

## 6. Luồng thay thế

### AF-01 – Thanh toán bằng ví QR mô phỏng

Sau khi chọn Thanh toán bằng ví QR, giao diện hiển thị mã QR mẫu và nút **Kiểm tra giao dịch**. Nút này chỉ đổi trạng thái xác nhận trên giao diện; không kiểm tra với MoMo/ZaloPay/ngân hàng. Sau khi xác nhận, người dùng có thể gửi yêu cầu thanh toán.

### AF-02 – Thanh toán bằng thẻ mô phỏng

Sau khi chọn Thanh toán bằng thẻ, khách hàng nhập thông tin thẻ. Frontend kiểm tra thông tin bằng `validateCard()`. Nếu hợp lệ, người dùng có thể gửi yêu cầu thanh toán.

### AF-03 – Thanh toán thất bại và thử lại
Nếu trạng thái Order là `PAYMENT_FAILED`. Giao diện hiển thị nút thử lại. Khách chọn thử lại trên đơn hàng cũ, frontend sinh `Idempotency-Key` mới và gửi yêu cầu lần nữa. Nếu thành công, đơn chuyển `PAYMENT_FAILED → PENDING → PAID`.

### AF-04 – Gửi lại cùng Idempotency-Key

Nếu Payment đã tồn tại với cùng khóa, API trả kết quả đã lưu (`reused = true`); không tạo Payment mới. Với các yêu cầu đồng thời, hệ thống có thêm điều kiện cập nhật trạng thái và khóa duy nhất ở database để tránh ghi nhận hai lần.

### AF-05 – Hủy đơn chưa thanh toán

Khách có thể hủy đơn ở `PENDING` hoặc `PAYMENT_FAILED` bằng `POST /orders/:id/cancel`. Backend chuyển Order sang `CANCELLED`, ghi lý do hủy và hoàn lại tồn kho/nguyên liệu theo quy tắc. Đây là ý định khác của khách hàng, không phải bước bắt buộc trong quá trình thanh toán.

### AF-06 – Có mã khuyến mãi

Khách nhập mã trong trang thanh toán. Giao diện kiểm tra mã qua `POST /promotions/validate`; khi tạo Order, `promoCode` được gửi lên backend và được kiểm tra/tính lại ở phía server. Việc áp mã không làm thay đổi cách `POST /payments` lấy tổng tiền từ Order.

## 7. Ngoại lệ

| Mã | Tình huống | Kết quả |
|---|---|---|
| EF-01 | Thiếu JWT hoặc token hết hạn | HTTP `401`; không cho phép tiếp tục thanh toán  |
| EF-02 | Đơn thuộc người khác | HTTP `403`; không cho phép tiếp tục thanh toán |
| EF-03 | `orderId` không tồn tại | HTTP `404`; không tạo Payment |
| EF-04 | Thiếu `Idempotency-Key`, khóa quá 64 ký tự, header/body không khớp hoặc DTO sai | HTTP `400`; không tạo Payment |
| EF-05 | Đơn đã `PAID`, `CANCELLED` hoặc trạng thái khác không thể thanh toán với key mới | HTTP `409`; không tạo Payment mới |
| EF-06 | Đơn chưa thanh toán quá hạn | `OrdersService` chuyển đơn thành trạng thái`CANCELLED`, hoàn kho và `POST /payments` trả `409` |
| EF-07 | Hai giao dịch đồng thời cạnh tranh trạng thái Order | Một giao dịch có thể thắng; yêu cầu còn lại bị từ chối hoặc trả bản ghi cũ nếu cùng key (Sử dụng optimistic lock + transaction) |
| EF-08 | Backend cấu hình provider khác `mock` | HTTP `503` vì adapter ngoài chưa được triển khai |

## 8. Hậu điều kiện

- **Thành công:** `Payment = PAID`, `Order = PAID`, hiển thị thành công, xóa giỏ, ghi nhận điểm thưởng.
- **Thất bại:** `Payment = FAILED`, `Order = PAYMENT_FAILED`, có thể thử lại/hủy.
- **Bị từ chối:** Không có Payment mới; đơn chỉ có thể đổi sang `CANCELLED` nếu hết thời gian thanh toán.
- **Gửi lại key cũ:** Không tạo lần thanh toán khác.


