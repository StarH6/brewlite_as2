# Đặc tả Yêu cầu Phần mềm

## 1. Yêu cầu chức năng (Functional Requirements)

| Mã ID | Nhóm chức năng | Tên yêu cầu | Mức ưu tiên | Tiêu chí chấp nhận có thể kiểm chứng |
| :--- | :--- | :--- | :---: | :--- |
| **FR-01** | Menu | Hiển thị danh mục đồ uống | **Must** | - GET /products trả danh sách sản phẩm gồm ID, tên, giá, hình ảnh và tồn kho. Giao diện có trạng thái loading, empty và error. |
| **FR-02** | Chi tiết món | Xem chi tiết sản phẩm & Tùy chọn | **Must** | - GET /products/:id trả mô tả, size và topping. Khách chọn một size, nhiều topping và xem giá tạm tính. |
| **FR-03** | Giỏ hàng | Quản lý giỏ hàng trên máy khách | **Must** | - Thêm, sửa số lượng, xóa món; hiển thị tổng tiền và tổng số lượng. Giỏ hàng được lưu trên trình duyệt thông qua LocalStorage. |
| **FR-04** | Xác thực | Đăng ký & Đăng nhập người dùng | **Must** | - Email không trùng, mật khẩu tối thiểu 6 ký tự và được băm bằng bcrypt. Đăng nhập thành công trả JWT. |
| **FR-05** | Đặt đơn | Tạo đơn hàng mới | **Must** | - Người dùng đã đăng nhập có thể đặt đơn. Server kiểm tra dữ liệu, tồn kho, tự tính tổng tiền và lưu đơn cùng chi tiết đơn trong transaction. Thiếu hàng thì từ chối đặt đơn. |
| **FR-06** | Thanh toán | Thanh toán không tiền mặt  | **Must** | - Khách thanh toán bằng ví hoặc thẻ mô phỏng. Thành công chuyển đơn sang PAID; thất bại chuyển sang trạng thái PAYMENT_FAILED, hiển thị thông báo và cho phép thử lại. Yêu cầu có Idempotency-Key để tránh xử lý lặp.   |
| **FR-07** | Lịch sử đơn | Xem chi tiết & Lịch sử đơn hàng cá nhân | **Must** | - Người dùng xem danh sách đơn của mình, gồm mã đơn, ngày đặt, món, tổng tiền và trạng thái. Không xem được đơn của người khác. |
| **FR-08** | Trạng thái đơn | Quản lý trạng thái xử lý đơn hàng (State Machine) | **Must** | - Hệ thống kiểm tra chuyển trạng thái hợp lệ. Khách có thể hủy đơn ở trạng thái PENDING, PAYMENT_FAILED, ; nhân viên có thể huỷ đơn ở trạng thái PAID của khách,  cập nhật trạng thái PREPARING, READY và COMPLETED. Đơn chưa thanh toán quá thời hạn sẽ chuyển sang trạng thái CANCELLED. |
| **FR-09** | Khuyến mãi | Áp dụng mã giảm giá | **Should** | - Server kiểm tra mã hợp lệ và thời hạn, sau đó tính giảm giá. Không cho tổng tiền là số âm và nhỏ hơn 0. |
| **FR-10** | Tích điểm | Tích lũy điểm thưởng thành viên | **Should** | - Có thể ghi nhận điểm sau khi thanh toán thành công. Mỗi đơn chỉ được cộng điểm một lần. |
| **FR-11** | Quản lý món | Cập nhật danh mục & trạng thái món  | **Could** | - Nhân viên được phép thêm, sửa sản phẩm và cập nhật tồn kho. Chức năng được triển khai nếu đủ thời gian. |
| **FR-12** | Vận chuyển | Giao hàng tận nơi | **Won't** | - Không làm giao hàng, phí ship, GPS, app tài xế. Chỉ pick-up tại quầy. |
| **FR-13** | Tiền mặt | Thanh toán tiền mặt tại quầy | **Won't** | - Không làm tiền mặt trong luồng online. Tôn chỉ 100% không tiền mặt. |
| **FR-14** | Vận hành | Health check & Seed | **Must** | - GET /health trả 200 OK. Có migration và seed để tạo dữ liệu thử nghiệm. |

---

## 2. Yêu cầu phi chức năng (Non-Functional Requirements)

| Mã ID | Nhóm yêu cầu | Tên yêu cầu phi chức năng | Mức ưu tiên | Tiêu chí chấp nhận và chỉ số đo lường |
| :--- | :--- | :--- | :---: | :--- |
| **NFR-01** | Hiệu năng | Tốc độ phản hồi của hệ thống | **Must** | - API danh sách sản phẩm phản hồi dưới 1 giây trong môi trường kiểm thử thông thường. |
| **NFR-02** | Bảo mật | An toàn thông tin & Phân quyền | **Must** | - Băm mật khẩu bằng bcrypt; API riêng tư yêu cầu JWT; người dùng chỉ truy cập đơn hàng của mình. Dữ liệu đầu vào được validate bằng class-validator. |
| **NFR-03** | Tính khả dụng | Trải nghiệm người dùng di động  | **Must** | - Giao diện Next.js mobile-first, hỗ trợ màn hình điện thoại; có loading, thông báo lỗi và trạng thái giỏ hàng trống. |
| **NFR-04** | Khả năng triển khai | Tự động hóa CI/CD & Đóng gói  | **Must** | - Có Docker Compose chạy web, API và database; GitHub Actions thực hiện lint, test, build. Có pipeline triển khai và URL production truy cập được. |
| **NFR-05** | Tính toàn vẹn | Nhất quán dữ liệu đồng thời & Idempotency | **Must** | - Tạo đơn và cập nhật tồn kho trong transaction. Backend tự tính tiền; thanh toán có cơ chế idempotency cơ bản để tránh xử lý lặp. |

---

## 3. Sơ đồ Use Case Tổng quát Hệ thống (System Use Case Diagram)

![Sơ đồ Use Case Tổng quát Hệ thống](./use-case-overview.svg)
