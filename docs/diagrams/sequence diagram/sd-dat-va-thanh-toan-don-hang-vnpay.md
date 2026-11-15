# Sequence Diagram: Đặt và thanh toán đơn hàng (VNPay sandbox)

Phạm vi: use-case **Đặt và thanh toán đơn hàng** (FR-03, FR-04, FR-05, FR-06, FR-08, FR-09, FR-10, NFR-02, NFR-05).

Năm lifeline theo Task 2.2: `Customer → Next.js UI → NestJS API → Database (PostgreSQL) → VNPay Sandbox`.
`VNPay Sandbox` thay cho `Payment Service (MOCK)` của bản trước. Nhánh MOCK vẫn còn trong code (khi `PAYMENT_PROVIDER=mock`) nhưng các sơ đồ dưới đây vẽ luồng `PAYMENT_PROVIDER=vnpay`.

**Cách render:** sao chép từng khối PlantUML vào https://www.plantuml.com/plantuml/ hoặc dùng extension PlantUML trong VS Code.

| Sơ đồ | Nội dung | Luồng trong đặc tả |
| :--- | :--- | :--- |
| SD-01 | Luồng tổng quát: đặt đơn, tạo URL VNPay, nhận kết quả | MF, AF-06 |
| SD-02 | Thanh toán thất bại và thử lại bằng key mới | AF-03 |
| SD-03 | Idempotency: gửi lại cùng key, request đồng thời, callback lặp | AF-04, EF-07 |
| SD-04 | Ngoại lệ khi đặt đơn và khi tạo yêu cầu thanh toán | EF-01 đến EF-06, EF-08 đến EF-15 |
| SD-05 | Ngoại lệ khi VNPay trả kết quả | EF-16 đến EF-20 |

## Những gì thay đổi so với bản MOCK

| Nội dung | Bản MOCK | Bản VNPay sandbox (theo code) |
| :--- | :--- | :--- |
| Kết quả thanh toán | Đồng bộ trong `POST /payments` | `POST /payments` chỉ tạo Payment `INITIATED` và trả `paymentUrl`. Kết quả về sau qua callback của VNPay |
| Payment `status` | `PAID`, `FAILED` | Thêm `INITIATED` |
| Nguyên nhân thất bại | `simulateFailure = true` | Mã phản hồi VNPay khác `00` (ví dụ khách hủy trên trang VNPay) |
| `simulateFailure` | Cho phép ngoài production | **Luôn bị từ chối (400)** khi dùng VNPay |
| Chống xử lý lặp | `updateMany` có điều kiện + unique key | Khóa dòng Order (`SELECT ... FOR UPDATE`) + unique key + so khớp kết quả callback |
| Giao dịch đang chờ | Không có | Đơn đang có Payment `INITIATED` còn hiệu lực thì tạo thêm bị 409 |
| Hết hạn thanh toán | Lazy expiry trong `POST /payments` | Lazy expiry cả khi tạo yêu cầu, khi nhận callback và khi đọc trạng thái |
| Thanh toán tiền về sau khi đơn đã hủy | Không có | Payment `PAID` với `refundRequired = true`, ghi log `VNPAY_REFUND_REQUIRED` |

---

## SD-01. Luồng tổng quát: đặt đơn, tạo URL VNPay, nhận kết quả

Truy vết: FR-03, FR-04, FR-05, FR-06, FR-08, FR-09, FR-10, NFR-02, NFR-05.

```plantuml
@startuml SD01_DatVaThanhToan_VNPay
title SD-01 - Dat va thanh toan don hang (VNPay sandbox)
autonumber

actor "Customer" as C
boundary "Next.js UI" as UI
control "NestJS API" as API
database "Database\n(PostgreSQL)" as DB
participant "VNPay Sandbox" as VNP

note over C,VNP
  5 lifeline theo Task 2.2. VNPay Sandbox la cong thanh toan thu nghiem ben ngoai.
  Ket qua thanh toan tra ve bat dong bo qua callback.
end note

== Giai doan 1: Tao don (khong doi so voi ban MOCK) ==
C -> UI: Xac nhan dat hang
UI -> API: POST /orders\n(Bearer JWT, items, promoCode)
activate API
API -> API: JwtAuthGuard va ValidationPipe
alt JWT hoac DTO khong hop le
    API --> UI: 401 / 400
    UI --> C: Thong bao loi
else Hop le
    API -> DB: BEGIN (Serializable)
    API -> DB: Kiem tra san pham, option, cong thuc, ton kho\n(ap dung promoCode neu co)
    alt San pham khong hop le / het hang / ma khuyen mai sai
        API -> DB: ROLLBACK
        API --> UI: 400 Bad Request
        UI --> C: Thong bao loi
    else Du dieu kien
        API -> DB: Tru ton kho, tao Order PENDING + OrderItems
        API -> DB: COMMIT
        API --> UI: 201 Created (orderId, orderCode, totalAmount)
    end
end

== Giai doan 2: Tao yeu cau thanh toan ==
UI -> UI: Tao Idempotency-Key
UI -> API: POST /payments\n(JWT, orderId, method, Idempotency-Key)
API -> API: Kiem tra JWT, DTO, Idempotency-Key (toi da 64 ky tu)
API -> DB: Tim Order theo orderId va userId
DB --> API: Order
API -> DB: expireOrderIfNeeded(orderId)\n(huy don neu qua han)
API -> DB: BEGIN\nKhoa dong Order (SELECT ... FOR UPDATE)
API -> DB: Tim Payment theo (userId, orderId, Idempotency-Key)
DB --> API: Chua co Payment
API -> API: Tinh expiresAt = min(createdAt + timeout, now + 15 phut)
opt Order dang PAYMENT_FAILED (thu lai)
    API -> DB: Order PAYMENT_FAILED -> PENDING
end
API -> API: Tao providerTxnRef, buildPaymentUrl\n(ky vnp_SecureHash, amount tu Order)
API -> DB: Tao Payment INITIATED\n(provider=vnpay, providerTxnRef, paymentUrl, expiresAt)
API -> DB: COMMIT
API --> UI: 200 OK\n(requiresRedirect=true, paymentUrl, orderStatus=PENDING)

== Giai doan 3: Khach thanh toan tren VNPay ==
UI -> VNP: Chuyen huong khach den paymentUrl
C -> VNP: Chon ngan hang / nhap the thu nghiem, xac nhan
alt Khach thanh toan thanh cong
    VNP -> API: Callback ket qua\n(vnp_TxnRef, vnp_Amount, vnp_ResponseCode=00,\nvnp_TransactionStatus=00, vnp_SecureHash)
    API -> API: verifyReturn: kiem tra chu ky vnp_SecureHash
    API -> DB: Tim Payment theo providerTxnRef
    API -> API: So khop vnp_Amount voi amount cua Payment
    API -> DB: expireOrderIfNeeded(orderId)
    API -> DB: BEGIN\nKhoa dong Order (FOR UPDATE)
    API -> DB: Payment INITIATED -> PAID\n(transactionReference, responseCode, bankCode, payDate)
    API -> DB: Order PENDING -> PAID
    API -> DB: COMMIT
    API -> DB: earnPoints(userId, orderId, amount)\n(sau khi commit, loi chi ghi log)
else Khach huy hoac VNPay bao loi
    VNP -> API: Callback ket qua\n(vnp_ResponseCode khac 00, vnp_SecureHash)
    API -> API: verifyReturn va so khop so tien
    API -> DB: BEGIN, khoa dong Order
    API -> DB: Payment INITIATED -> FAILED
    API -> DB: Order PENDING -> PAYMENT_FAILED
    API -> DB: COMMIT
end
VNP --> UI: Chuyen huong khach ve Return URL

== Giai doan 4: Hien thi ket qua ==
UI -> API: GET /payments/order/:orderId\n(Cache-Control: no-store)
API -> DB: expireOrderIfNeeded, doc Order va Payment moi nhat
DB --> API: orderStatus, payment
API --> UI: 200 OK (orderStatus, payment)
alt orderStatus = PAID
    UI -> UI: Xoa gio hang
    UI --> C: Thong bao dat hang va thanh toan thanh cong
else orderStatus = PAYMENT_FAILED
    UI --> C: Thong bao that bai, hien thi nut Thu lai
else orderStatus = PENDING (callback chua den)
    UI --> C: Dang cho xac nhan thanh toan
end

deactivate API
@enduml
```

---

## SD-02. AF-03: Thanh toán thất bại và thử lại bằng key mới

Truy vết: FR-06, FR-08, NFR-05.

Thất bại do VNPay trả mã khác `00` (ví dụ khách hủy trên trang VNPay), không còn do `simulateFailure`. Thử lại phải dùng **Idempotency-Key mới (K2)** và tạo Payment `INITIATED` mới với `providerTxnRef` mới. Deadline thanh toán vẫn tính từ `createdAt` của đơn, không được gia hạn.

```plantuml
@startuml SD02_ThatBaiVaThuLai_VNPay
title SD-02 - Thanh toan that bai va thu lai bang key moi (VNPay sandbox)
autonumber

actor "Customer" as C
boundary "Next.js UI" as UI
control "NestJS API" as API
database "Database\n(PostgreSQL)" as DB
participant "VNPay Sandbox" as VNP

== Lan 1: that bai ==
C -> UI: Xac nhan thanh toan
UI -> API: POST /payments (JWT, orderId, K1)
activate API
API -> DB: Khoa dong Order, tao Payment INITIATED (K1, txnRef1)
API --> UI: 200 OK (paymentUrl, requiresRedirect=true)
UI -> VNP: Chuyen huong khach den paymentUrl
C -> VNP: Huy giao dich / thanh toan khong thanh cong
VNP -> API: Callback (vnp_ResponseCode khac 00, vnp_SecureHash)
API -> API: Kiem tra chu ky va so tien
API -> DB: BEGIN, khoa dong Order
API -> DB: Payment INITIATED -> FAILED (responseCode)
API -> DB: Order PENDING -> PAYMENT_FAILED
API -> DB: COMMIT
VNP --> UI: Chuyen huong khach ve Return URL
UI -> API: GET /payments/order/:orderId
API --> UI: orderStatus=PAYMENT_FAILED, payment FAILED
UI --> C: Thong bao that bai, hien thi nut Thu lai

== Lan 2: thu lai bang key moi ==
C -> UI: Chon Thu lai
UI -> UI: Tao Idempotency-Key moi (K2)
UI -> API: POST /payments (JWT, cung orderId, K2)
API -> DB: expireOrderIfNeeded(orderId)
alt Don da qua han thanh toan
    API -> DB: Order PAYMENT_FAILED -> CANCELLED (SYSTEM_EXPIRED), hoan kho
    API --> UI: 409 Conflict (don bi huy, tao don moi)
    UI --> C: Thong bao don het han
else Con han
    API -> DB: BEGIN, khoa dong Order
    API -> DB: Tim Payment theo (userId, orderId, K2)
    DB --> API: Chua co
    API -> DB: Khong co Payment INITIATED nao con hieu luc
    API -> DB: Order PAYMENT_FAILED -> PENDING
    API -> DB: Tao Payment INITIATED moi (K2, txnRef2, paymentUrl moi)
    API -> DB: COMMIT
    API --> UI: 200 OK (paymentUrl moi, requiresRedirect=true)
    UI -> VNP: Chuyen huong khach den paymentUrl moi
    C -> VNP: Thanh toan thanh cong
    VNP -> API: Callback (vnp_ResponseCode=00, vnp_TransactionStatus=00)
    API -> DB: Payment INITIATED -> PAID, Order PENDING -> PAID
    API -> DB: earnPoints (sau commit)
    VNP --> UI: Chuyen huong ve Return URL
    UI -> API: GET /payments/order/:orderId
    API --> UI: orderStatus=PAID
    UI --> C: Thong bao thanh toan thanh cong
end

deactivate API
@enduml
```

---

## SD-03. AF-04 và EF-07: Idempotency, request đồng thời, callback lặp

Truy vết: FR-06, NFR-05.

Cơ chế bảo vệ trong code VNPay: (1) khóa dòng Order bằng `FOR UPDATE` để các lần tạo thanh toán tuần tự hóa, (2) unique `(userId, orderId, idempotencyKey)` và `providerTxnRef`, (3) callback lặp được so khớp với kết quả đã lưu.

```plantuml
@startuml SD03_Idempotency_VNPay
title SD-03 - Idempotency: gui lai cung key, request dong thoi, callback lap (VNPay sandbox)
autonumber

actor "Customer" as C
boundary "Next.js UI" as UI
control "NestJS API" as API
database "Database\n(PostgreSQL)" as DB
participant "VNPay Sandbox" as VNP

== A. Gui lai cung Idempotency-Key ==
C -> UI: Xac nhan thanh toan
UI -> API: POST /payments (K1, orderId)
activate API
API -> DB: BEGIN, khoa dong Order
API -> DB: Tao Payment INITIATED (K1, paymentUrl)
API -> DB: COMMIT
API --> UI: 200 OK (reused=false, paymentUrl)
C -> UI: Gui lai (mat mang, bam hai lan)
UI -> API: POST /payments (van K1, cung orderId)
API -> DB: BEGIN, khoa dong Order
API -> DB: Tim Payment theo (userId, orderId, K1)
DB --> API: Payment da luu
API -> DB: COMMIT
alt Payment INITIATED va chua het han, Order PENDING
    API --> UI: 200 OK (reused=true, requiresRedirect=true, paymentUrl cu)
    UI --> C: Tiep tuc sang URL thanh toan hien tai
else Payment da PAID / FAILED hoac het han
    API --> UI: 200 OK (reused=true, requiresRedirect=false, ket qua cu)
    UI --> C: Hien thi ket qua da ghi nhan
end

== B. Hai request cung key chay dong thoi (EF-07) ==
par Request A
    UI -> API: POST /payments (K1)
    API -> DB: Khoa dong Order (lay duoc khoa truoc)
    API -> DB: Tao Payment INITIATED (K1)
    API -> DB: COMMIT, nha khoa
    API --> UI: 200 OK (reused=false)
else Request B
    UI -> API: POST /payments (K1)
    API -> DB: Khoa dong Order (cho den khi A commit)
    API -> DB: Tim Payment theo K1
    DB --> API: Payment cua Request A
    API --> UI: 200 OK (reused=true)
end

== C. Khac key khi dang co giao dich cho xac nhan ==
UI -> API: POST /payments (K2, cung orderId)
API -> DB: Khoa dong Order, tim Payment K2
DB --> API: Chua co
API -> DB: Tim Payment INITIATED cua don (provider=vnpay)
DB --> API: Co giao dich dang cho (K1)
API --> UI: 409 Conflict (tiep tuc URL hien tai, khong thanh toan lan hai)

== D. VNPay goi lai callback nhieu lan ==
VNP -> API: Callback lan 1 (vnp_TxnRef, vnp_ResponseCode=00)
API -> DB: Khoa dong Order, Payment INITIATED -> PAID, Order -> PAID
API -> DB: COMMIT, earnPoints
VNP -> API: Callback lan 2 (cung noi dung)
API -> DB: Khoa dong Order, doc Payment (da PAID)
alt Ket qua trung voi da luu (paid, responseCode, transactionStatus, transactionNo)
    API --> VNP: Xu ly thanh cong (khong cap nhat, khong cong diem lan hai)
else Ket qua khac voi da luu
    API --> VNP: 409 Conflict (ket qua xung dot)
end

deactivate API
note over API,DB
  Bao ve bang: khoa dong Order (FOR UPDATE), unique (userId, orderId, idempotencyKey),
  unique providerTxnRef, so khop ket qua callback voi Payment da xac nhan,
  loyalty idempotent theo (orderId, EARN).
end note
@enduml
```

---

## SD-04. Ngoại lệ khi đặt đơn và khi tạo yêu cầu thanh toán

Truy vết: FR-04, FR-05, FR-06, FR-08, FR-09, NFR-02, NFR-05.

| Mã | Tình huống | Kết quả |
| :--- | :--- | :--- |
| EF-01 | Thiếu JWT hoặc token hết hạn/sai | 401 Unauthorized |
| EF-02, EF-03 | Đơn không tồn tại hoặc không thuộc người dùng | 404 (truy vấn theo `orderId` và `userId`) |
| EF-04 | Thiếu Idempotency-Key, quá 64 ký tự, header khác body, DTO sai | 400 |
| EF-05 | Đơn không ở `PENDING` hoặc `PAYMENT_FAILED` với key mới | 409 |
| EF-06 | Đơn chưa thanh toán quá hạn | Lazy expiry: đơn `CANCELLED` (`SYSTEM_EXPIRED`), hoàn kho, tạo thanh toán trả 409 |
| EF-08 | `PAYMENT_PROVIDER` khác `mock` và `vnpay` | 503 |
| EF-09 | Giỏ rỗng, số lượng sai, topping trùng, DTO sai | 400, không tạo đơn |
| EF-10 | Sản phẩm không tồn tại/không ACTIVE hoặc option không hợp lệ | 400, rollback |
| EF-11 | Không đủ tồn kho hoặc nguyên liệu | 400, rollback |
| EF-12 | Mã khuyến mãi không tồn tại hoặc không đủ điều kiện | 400, rollback |
| EF-13 | Xung đột transaction quá số lần thử | 409 |
| EF-14 | `simulateFailure = true` khi dùng VNPay (luôn bị chặn) | 400 |
| EF-15 | Đơn đang có giao dịch VNPay `INITIATED` còn hiệu lực, khác key | 409 |

```plantuml
@startuml SD04_NgoaiLe_DatDonVaTaoThanhToan
title SD-04 - Ngoai le khi dat don va khi tao yeu cau thanh toan (VNPay sandbox)
autonumber

actor "Customer" as C
boundary "Next.js UI" as UI
control "NestJS API" as API
database "Database\n(PostgreSQL)" as DB
participant "VNPay Sandbox" as VNP

C -> UI: Xac nhan dat don
UI -> API: POST /orders (JWT, DTO)
activate API
alt EF-01: JWT thieu, sai hoac het han
    API --> UI: 401 Unauthorized
    UI --> C: Yeu cau dang nhap lai
else JWT hop le
    alt EF-09: DTO / gio hang khong hop le
        API --> UI: 400 Bad Request
        UI --> C: Hien thi loi du lieu don hang
    else DTO hop le
        API -> DB: BEGIN (Serializable), kiem tra san pham va ton kho
        alt EF-10: San pham / option khong hop le
            API -> DB: ROLLBACK
            API --> UI: 400 Bad Request
        else EF-11: Khong du ton kho / nguyen lieu
            API -> DB: ROLLBACK
            API --> UI: 400 Bad Request
        else EF-12: Ma khuyen mai khong hop le
            API -> DB: ROLLBACK
            API --> UI: 400 Bad Request
        else EF-13: Xung dot transaction het so lan thu
            API -> DB: ROLLBACK
            API --> UI: 409 Conflict
        else Tao don thanh cong
            API -> DB: Tru ton kho, tao Order PENDING, COMMIT
            API --> UI: 201 Created
        end
    end
end
UI --> C: Hien thi thong bao tuong ung

C -> UI: Xac nhan thanh toan
UI -> API: POST /payments (JWT, orderId, key)
alt EF-01: JWT thieu hoac sai
    API --> UI: 401 Unauthorized
else EF-04: Key thieu, qua 64 ky tu, header khac body, DTO sai
    API --> UI: 400 Bad Request
else EF-08: PAYMENT_PROVIDER khong ho tro
    API --> UI: 503 Service Unavailable
else EF-14: simulateFailure = true
    API --> UI: 400 Bad Request
else Request hop le
    API -> DB: Tim Order theo orderId va userId
    alt EF-02/EF-03: Khong tim thay Order
        API --> UI: 404 Not Found
    else Tim thay Order
        API -> DB: expireOrderIfNeeded(orderId)
        API -> DB: BEGIN, khoa dong Order, doc lai Order
        alt EF-05 / EF-06: Order khong con PENDING hoac PAYMENT_FAILED (da PAID, da CANCELLED...)
            API --> UI: 409 Conflict
        else EF-06: expiresAt da qua
            API --> UI: 409 Conflict (qua han thanh toan, tao don moi)
        else EF-15: Co Payment INITIATED con hieu luc (khac key)
            API --> UI: 409 Conflict
        else Hop le
            API -> DB: Tao Payment INITIATED, COMMIT
            API --> UI: 200 OK (paymentUrl)
            UI -> VNP: Chuyen huong khach den VNPay
        end
    end
end
UI --> C: Hien thi thong bao tuong ung

deactivate API
@enduml
```

---

## SD-05. Ngoại lệ khi VNPay trả kết quả

Truy vết: FR-06, FR-08, FR-10, NFR-02, NFR-05.

| Mã | Tình huống | Kết quả |
| :--- | :--- | :--- |
| EF-16 | Sai chữ ký `vnp_SecureHash` | Bị từ chối trong `verifyReturn`, không cập nhật Payment (mã lỗi và dạng phản hồi cho VNPay nằm ở `VnpayService`/`VnpayController`, chưa có file) |
| EF-17 | Không tìm thấy Payment theo `providerTxnRef` | 404 |
| EF-18 | `vnp_Amount` không khớp số tiền Payment | 400, không cập nhật |
| EF-19 | Kết quả callback lặp nhưng khác kết quả đã lưu | 409 |
| EF-20 | VNPay báo thành công nhưng đơn đã hết hạn hoặc đã hủy | Payment `PAID` với `refundRequired = true`, đơn giữ nguyên `CANCELLED`, không cộng điểm, ghi log `VNPAY_REFUND_REQUIRED` |
| EF-21 | Khách hủy hoặc VNPay báo lỗi (mã khác `00`) | Payment `FAILED`, Order `PAYMENT_FAILED`, cho thử lại (xem SD-02) |

```plantuml
@startuml SD05_NgoaiLe_KetQuaVNPay
title SD-05 - Ngoai le khi VNPay tra ket qua
autonumber

actor "Customer" as C
boundary "Next.js UI" as UI
control "NestJS API" as API
database "Database\n(PostgreSQL)" as DB
participant "VNPay Sandbox" as VNP

VNP -> API: Callback ket qua (vnp_*, vnp_SecureHash)
activate API
API -> API: verifyReturn: kiem tra chu ky
alt EF-16: Sai chu ky
    API --> VNP: Tu choi, khong cap nhat du lieu
else Chu ky hop le
    API -> DB: Tim Payment theo providerTxnRef
    alt EF-17: Khong tim thay Payment
        API --> VNP: 404 Not Found
    else Tim thay Payment
        alt EF-18: vnp_Amount khong khop amount
            API --> VNP: 400 Bad Request
        else So tien khop
            API -> DB: expireOrderIfNeeded(orderId)
            API -> DB: BEGIN, khoa dong Order, doc Payment va Order
            alt Payment da khong con INITIATED
                alt EF-19: Ket qua khac voi da luu
                    API -> DB: ROLLBACK
                    API --> VNP: 409 Conflict
                else Ket qua trung (callback lap)
                    API --> VNP: Xu ly thanh cong, khong cap nhat lai
                end
            else Payment dang INITIATED
                alt EF-21: vnp_ResponseCode khac 00 (khach huy / loi)
                    API -> DB: Payment -> FAILED, Order PENDING -> PAYMENT_FAILED
                    API -> DB: COMMIT
                else Thanh toan thanh cong, Order con PENDING
                    API -> DB: Payment -> PAID, Order PENDING -> PAID
                    API -> DB: COMMIT
                    API -> DB: earnPoints (sau commit, loi chi ghi log)
                else EF-20: Thanh toan thanh cong nhung Order da CANCELLED (het han / bi huy)
                    API -> DB: Payment -> PAID, refundRequired = true
                    API -> DB: Order giu nguyen CANCELLED
                    API -> DB: COMMIT
                    API -> API: Ghi log VNPAY_REFUND_REQUIRED (khong cong diem)
                end
            end
        end
    end
end
UI -> API: GET /payments/order/:orderId
API --> UI: orderStatus va payment moi nhat
UI --> C: Hien thi ket qua tuong ung
deactivate API
@enduml
```

---

## Ghi chú để đối chiếu

1. **EF-06 đã có căn cứ trong code:** cơ chế lazy expiry (`expireOrderIfNeeded`) hủy đơn quá hạn và hoàn kho, kích hoạt khi tạo thanh toán, khi nhận callback, khi xem chi tiết đơn, khi xem danh sách đơn và khi đọc trạng thái thanh toán. Không có cron. Lý do hủy lưu ở `cancelReason`, `cancelledAt`, `cancelledBy` (AF-05 đúng như đặc tả).
2. **Phần chưa có file nên vẽ ở mức chung:** `VnpayController` (đường dẫn Return URL và IPN, dạng phản hồi trả cho VNPay), `VnpayService` (`buildPaymentUrl`, `verifyReturn`) và `vnpay.protocol.ts`. Các bước "Callback" và "Chuyển hướng về Return URL" trong SD-01, SD-02, SD-05 cần đối chiếu lại khi có các file này.
3. **Giao diện:** các bước chuyển hướng sang VNPay, trang kết quả và việc UI gọi `GET /payments/order/:orderId` để lấy kết quả chưa có code frontend để xác nhận.
4. **Đơn đang chờ VNPay mà khách bấm hủy:** `cancelOrder` chuyển Order sang `CANCELLED` nhưng không đóng Payment `INITIATED`. Nếu sau đó VNPay báo thành công thì rơi vào EF-20 (`refundRequired`). Đây là hành vi nên ghi rõ trong đặc tả.
5. **Nhánh MOCK vẫn tồn tại** khi `PAYMENT_PROVIDER=mock`. Nếu báo cáo chỉ nói VNPay thì nên ghi chú đây là cấu hình môi trường.
6. **`PATCH /orders/:id/status`:** bản mới có thêm kiểm tra hết hạn nhưng vẫn chỉ gọi `assertTransition` rồi ghi trạng thái, nên vẫn có thể đặt `CANCELLED` mà không hoàn kho, hoặc đặt `PAID` mà không có Payment.
7. **Đặc tả use-case Task 1.3 cần cập nhật theo:** AF-01 và AF-02 (ví QR/thẻ mô phỏng), EF-08, EF-14, hậu điều kiện, và thêm EF-15 đến EF-21.
