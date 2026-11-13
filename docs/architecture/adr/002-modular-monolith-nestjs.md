# ADR-002: Modular monolith với NestJS

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: đã hiện thực (không có UsersModule/RolesGuard). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: FR-05, FR-06, FR-08, FR-10, NFR-05

## Bối cảnh

BrewLite có các domain auth, users, products, orders, payments, promotions, loyalty, health. Quy mô đồ án nhỏ nhưng cần ranh giới rõ để dễ đọc, dễ test và có thể tách sau này. Các thao tác đơn/thanh toán/tồn kho cần transaction ACID.

## Các lựa chọn đã cân nhắc

1. **Modular monolith**: một NestJS API, chia module theo domain.
2. **Microservices**: auth, order, payment, notification là các service riêng.
3. **Một codebase không chia module**: controller gọi Prisma trực tiếp.
4. **Serverless functions** cho từng endpoint.

## Quyết định

Chọn phương án **1**:

- Mỗi domain là một `@Module` trong `apps/api/src/<domain>/`.
- Luồng phụ thuộc: `Controller → Application Service → Domain Policy/State Machine → Repository → Prisma → PostgreSQL`.
- `Order.assertTransition()` (do domain service `OrderStateMachine` hiện thực) là nguồn duy nhất của transition (FR-08).
- `PaymentGateway` là port; mock/gateway thật là adapter (ADR-005).
- Không dùng message queue, service discovery hay Kubernetes.

## Hệ quả

**Tích cực**

- Transaction ACID trong một DB; không cần saga/distributed transaction.
- Một container API, một pipeline, debug và trace đơn giản.
- Ranh giới module đủ rõ để unit test policy/state machine và integration test API.
- Có thể tách payment/order thành service sau này nếu tải thật sự tăng.

**Tiêu cực**

- Một API là single point of failure; không scale độc lập từng domain.
- Dễ vi phạm ranh giới nếu service import chéo hoặc controller dùng Prisma trực tiếp.
- Một codebase lớn dần; cần kỷ luật review.

**Kiểm soát**

- Controller không gọi Prisma; service sở hữu transaction.
- Chỉ gọi service public của module khác; không import repository chéo.
- Review dependency và test state machine/policy độc lập.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Đã hiện thực – có điều chỉnh nhỏ
- **Đúng thiết kế**: modular monolith NestJS theo domain trong `apps/api/src/`: `auth`, `products`, `orders`, `payments`, `promotions`, `loyalty`, `health`, `prisma`, `config`, `common`. Logic thuần nằm ở `domain/` (`orders/domain/order-state-machine.ts`, `promotions/domain/promotion-policy.ts`, `loyalty/domain/loyalty-policy.ts`) và có unit test `.spec.ts` đi kèm.
- **Khác thiết kế**: không có `UsersModule` riêng (`User` do `AuthModule`/Prisma quản lý); không có `RolesGuard` (kiểm tra `UserRole.STAFF` trực tiếp trong controller/service); chưa có `AuditModule` (Extended, ngoài MVP).
- **Quyết định vẫn giữ nguyên**.
