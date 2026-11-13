# ADR-008: Xác thực bằng JWT + Bcrypt

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: đã hiện thực (không RolesGuard, token ở localStorage). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: FR-04, NFR-02, RSK-04

## Bối cảnh

FR-04/NFR-02 yêu cầu đăng ký/đăng nhập, bảo vệ `POST /orders`, `POST /payments`, `GET /orders/me`; mật khẩu không lưu plaintext; role lấy từ DB, không tin client. Task 2 mô tả JWT Bearer trong sequence diagram.

## Các lựa chọn đã cân nhắc

1. **JWT stateless + Bcrypt + Guard/Role của NestJS**.
2. Session cookie server-side (lưu session trong DB/Redis).
3. OAuth2/OIDC qua provider ngoài.
4. Magic link/OTP.

## Quyết định

Chọn phương án **1**:

- `POST /auth/register`: validate email/mật khẩu ≥ 6; băm Bcrypt salt rounds ≥ 10; email trùng trả `409`.
- `POST /auth/login`: so sánh Bcrypt; cấp JWT chứa `userId`, `email`, `role`; expiry ~1h; sai trả `401`.
- `JwtAuthGuard` bảo vệ route nhạy cảm; thiếu/hết hạn `401`.
- `RolesGuard` kiểm tra role đọc từ DB; sai quyền `403`.
- JWT gửi qua `Authorization: Bearer`; client lưu ở bộ nhớ + `sessionStorage` (MVP), không đưa vào URL/log.
- `JWT_SECRET` tối thiểu 32 ký tự, chỉ ở env/secret; không commit.

## Hệ quả

**Tích cực**

- Đơn giản, phù hợp REST/PWA; không cần lưu session.
- Role lấy từ DB nên không tin client; dễ mở rộng `STAFF` cho KDS/Admin.
- Không lưu mật khẩu plaintext.

**Tiêu cực**

- Token hết hạn không thu hồi ngay; chưa có refresh/rotation.
- XSS có thể đánh cắp token nếu lưu lâu; `sessionStorage` giảm cửa sổ nhưng không loại bỏ rủi ro.
- Logout chỉ xóa token phía client.

**Giảm thiểu**

- Expiry ngắn, CSP, không log token, không lưu token trong URL.
- Cân nhắc httpOnly cookie + CSRF nếu đổi mô hình.
- Thêm refresh/rotation khi có yêu cầu bảo mật cao hơn.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Đã hiện thực – có điều chỉnh
- **Đúng thiết kế**: đăng ký/đăng nhập ở `apps/api/src/auth/`; băm Bcrypt với `BCRYPT_SALT_ROUNDS = 10`; JWT hết hạn mặc định `1h` (`JWT_EXPIRES_IN`); `JwtStrategy` đọc lại `role`/`isActive` từ DB mỗi request nên không tin role trong token; email trùng → `409`; có hash giả khi đăng nhập sai email để giảm lộ thông tin; `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) toàn cục ở `main.ts`.
- **Khác thiết kế**: không có `RolesGuard`/decorator `@Roles` — phân quyền STAFF được kiểm tra trực tiếp trong `orders.controller.ts` và `orders.service.ts` (trả `403`); token phía client lưu ở `localStorage` (`apps/web/lib/auth-store.ts`) thay vì `sessionStorage` như mô tả.
- **Chưa có**: Helmet/CSP, rate limit cho `/auth/login`.
- **Ghi chú**: `localStorage` dễ bị XSS đọc hơn `sessionStorage`; nên ghi rõ là trade-off hoặc đổi theo thiết kế.
