# 1. Bối cảnh, Stakeholder và Phạm vi Hệ thống

## 1.1. Bối cảnh nghiệp vụ

Tại các quán cà phê, khách hàng thường phải chờ đợi khi gọi món và thanh toán vào giờ cao điểm. Quy trình thủ công cũng có thể dẫn đến nhầm lẫn đơn hàng và sai sót trong quá trình thanh toán.

**BrewLite** là ứng dụng đặt đồ uống trên nền tảng web theo hướng Mobile-First/PWA. Hệ thống cho phép khách hàng xem menu, tùy chỉnh size và topping, quản lý giỏ hàng, đặt đơn, thanh toán không tiền mặt và theo dõi trạng thái đơn hàng. Mục tiêu là giảm thời gian chờ, hạn chế sai sót và nâng cao hiệu quả phục vụ.

## 1.2. Stakeholder

| Stakeholder | Vai trò và mục tiêu chính |
|---|---|
| Khách hàng | Xem menu, tùy chỉnh món, đặt hàng, thanh toán và theo dõi đơn qua ứng dụng. |
| Nhân viên quầy | Tiếp nhận đơn, pha chế và cập nhật trạng thái phục vụ. |
| Quản lý cửa hàng / Product Owner | Quản lý hoạt động, xác định yêu cầu, ưu tiên backlog và nghiệm thu sản phẩm. |
| Giảng viên / Người nghiệm thu | Đánh giá quy trình phát triển, tài liệu, kiểm thử, truy vết và sản phẩm triển khai. |
| Nhóm phát triển | Phân tích, thiết kế, lập trình, kiểm thử và triển khai hệ thống. |
| Dịch vụ thanh toán | Mô phỏng hoặc cung cấp giao dịch trực tuyến và phản hồi kết quả thanh toán. |

## 1.3. Phạm vi hệ thống

### a. Phạm vi MVP (In-Scope)

- **Menu và chi tiết sản phẩm:** Hiển thị tên, hình ảnh, mô tả, giá, tình trạng hàng; cho phép chọn size và topping.
- **Giỏ hàng:** Thêm, sửa số lượng, xóa món, tính tổng tiền và duy trì giỏ hàng trên trình duyệt.
- **Tài khoản:** Đăng ký, đăng nhập; sử dụng Bcrypt để băm mật khẩu và JWT để xác thực API.
- **Đặt hàng:** Tạo đơn từ giỏ hàng, kiểm tra lại giá và tồn kho phía server; sử dụng transaction và optimistic locking để bảo đảm tính toàn vẹn dữ liệu.
- **Thanh toán mô phỏng:** Hỗ trợ ví điện tử hoặc thẻ ngân hàng giả lập; sử dụng `Idempotency-Key` để tránh xử lý thanh toán trùng lặp.
- **Lịch sử và trạng thái đơn:** Hiển thị xác nhận, mã đơn, trạng thái và lịch sử đơn hàng của khách hàng.

### b. Phạm vi mở rộng (Extended Scope)

- **Giao diện pha chế (KDS):** Cho phép nhân viên xem đơn đã thanh toán và cập nhật trạng thái `PREPARING`, `READY`, `COMPLETED`.
- **Quản trị sản phẩm và tồn kho:** Cho phép nhân viên có quyền cập nhật thông tin sản phẩm và quản lý tồn kho.

### c. Ngoài phạm vi (Out-of-Scope)

- Giao hàng tận nơi, định vị GPS và quản lý tài xế.
- Thanh toán tiền mặt trong quy trình đặt hàng trực tuyến.
- Quản lý nhân sự và các nghiệp vụ nội bộ khác của cửa hàng.

## 1.4. Giả định và ràng buộc

### a. Giả định

- Khách hàng có thiết bị di động hoặc máy tính với kết nối Internet và trình duyệt tương thích.
- Dữ liệu mẫu về sản phẩm, size và topping có sẵn để phát triển và kiểm thử.
- Cổng thanh toán trong MVP là dịch vụ mô phỏng, có thể trả về kết quả thành công hoặc thất bại.

### b. Ràng buộc kỹ thuật và bảo mật

| Hạng mục | Ràng buộc |
|---|---|
| Frontend | Next.js, React, TypeScript; giao diện Mobile-First/PWA. |
| Backend | NestJS; sử dụng DTO, `class-validator` và JWT Guard. |
| Cơ sở dữ liệu | PostgreSQL; sử dụng Prisma để quản lý schema và migration. |
| Triển khai | Docker, Docker Compose và CI/CD. |
| Bảo mật | Không lưu mật khẩu dạng plaintext; bảo vệ API yêu cầu đăng nhập; không commit secrets vào repository. |

## 1.5. Phân tích rủi ro ban đầu

| Mã | Rủi ro | Ảnh hưởng | Khả năng | Biện pháp giảm thiểu |
|---|---|---|---|---|
| RSK-01 | Bán vượt tồn kho khi nhiều khách đặt đồng thời. | Cao | Trung bình | Dùng transaction kết hợp với optimistic locking khi kiểm tra và trừ tồn kho. |
| RSK-02 | Thanh toán bị xử lý nhiều lần do người dùng nhấn lại hoặc client retry. | Rất cao | Trung bình | Sử dụng `Idempotency-Key`, lưu kết quả giao dịch và ngăn gọi cổng thanh toán lần nữa với cùng key. |
| RSK-03 | Cổng thanh toán timeout hoặc không xác định được kết quả. | Cao | Thấp | Trạng thái `CANCELLED` khi hết thời gian timeout |
| RSK-04 | Lộ mật khẩu hoặc thông tin bí mật trong repository. | Rất cao | Thấp | Dùng `.env`, `.env.example`, `.gitignore` và kiểm tra secrets trong CI. |
| RSK-05 | Yêu cầu không khớp với thiết kế, mã nguồn và kiểm thử. | Trung bình | Cao | Dùng mã `FR`, `NFR`, `UC` thống nhất và cập nhật `docs/traceability-matrix.md` qua từng Sprint. |
