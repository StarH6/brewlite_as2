# Truy vết Yêu cầu (Traceability Matrix)

Tài liệu này theo dõi chuỗi truy vết từ Yêu cầu (Task 1) $\rightarrow$ Thiết kế & Sơ đồ (Task 2 & 3) $\rightarrow$ Hiện thực Code/API (Task 4 & 5) $\rightarrow$ Kiểm thử tự động (Task 4 & 5).

## 1. Yêu cầu chức năng (FR)

| Mã yêu cầu | Tên yêu cầu / Mô tả | Use-case / User Story | Thiết kế / Sơ đồ | Code / API | Test Case | Trạng thái |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **FR-01** | Hiển thị menu đồ uống | US-01 / UC-01 Xem menu | Activity-01, Class-01 | `GET /products` | API-T01, UI-T01 | Sẵn sàng (Task 1) |
| **FR-02** | Xem chi tiết & Tùy chọn (size, topping) | US-02 / UC-02, UC-03 Chi tiết món & Size/Topping | Activity-01, Sequence-01, Class-01 | `GET /products/:id` | API-T02, UI-T02 | Sẵn sàng (Task 1) |
| **FR-03** | Quản lý giỏ hàng & tính tiền (client-side) | US-03 / UC-04, UC-04a Giỏ hàng | Activity-01, Sequence-01, Class-01 | Client state (Zustand) + localStorage | UI-T03 | Sẵn sàng (Task 1) |
| **FR-04** | Đăng ký & Đăng nhập (Bcrypt, JWT) | US-04 / UC-05, UC-06 Xác thực | Activity-01, Sequence-01, Class-01 | `POST /auth/register`, `POST /auth/login` | API-T03, INT-T01 | Sẵn sàng (Task 1) |
| **FR-05** | Đặt đơn hàng (Transaction, Optimistic Locking trừ tồn kho) | US-05 / UC-07 Đặt đơn hàng | Activity-01, Sequence-01, Class-01 | `POST /orders` (`Product.version`) | INT-T02, CONC-T01 | Đã hoàn thành (CV10, CV18) |
| **FR-06** | Thanh toán không tiền mặt (Idempotent) | US-06 / UC-08 Thanh toán đơn hàng | Activity-01, Sequence-01, Class-01 | `POST /payments` (+ `Idempotency-Key`) | INT-T03, INT-T04 | Đã hoàn thành (CV14, CV17) |
| **FR-07** | Lịch sử & Trạng thái đơn hàng cá nhân | US-07 / UC-10 Xem lịch sử & trạng thái đơn | Activity-01, Sequence-01, Class-01 | `GET /orders/me`, `GET /orders/:id` | API-T04 | Đã hoàn thành (CV16) |
| **FR-08** | Order State Machine (nguồn duy nhất) | US-08 / UC-11 Quản lý trạng thái đơn | Activity-01, Sequence-01, Class-01 | `Order.assertTransition()` (State Machine Service) | UNIT-T02, INT-T04 | Đã hoàn thành (CV15) |
| **FR-09** | Áp dụng mã khuyến mãi | US-09 / UC-09 Áp dụng khuyến mãi | Activity-01, Sequence-01, Class-01 | Validate `promoCode` trong `POST /orders` | UNIT-T01 | Đã hoàn thành (CV21) |
| **FR-10** | Tích lũy điểm thưởng (idempotent theo orderId) | US-10 / UC-08 (bước post-commit) | Activity-01, Sequence-01, Class-01 | `LoyaltyService` sau commit `PENDING → PAID` | UNIT-T03 | Đã hoàn thành (CV21) |
| **FR-11** | Quản lý món & trạng thái món (Extended) | US-11 / UC-12 Quản lý sản phẩm/menu | Class-01, Deployment-01 | `PATCH /products/:id` (role=STAFF, audit log) | API-T05 | Sẵn sàng (Task 1) - Extended |
| **FR-12** | Giao hàng tận nơi | — (Out-of-Scope) | — | — | — | Không thực hiện (Won't) |
| **FR-13** | Thanh toán tiền mặt tại quầy | — (Out-of-Scope) | — | — | — | Không thực hiện (Won't) |
| **FR-14** | Vận hành: Health check & Seed | Toàn hệ thống | Deployment-01 | `GET /health`, Prisma `migrate` + `seed` | SMOKE-T01 | Đã hoàn thành |

## 2. Yêu cầu phi chức năng (NFR)

| Mã yêu cầu | Tên yêu cầu | Use-case / User Story | Thiết kế / Sơ đồ | Code / API | Test Case | Trạng thái |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **NFR-01** | Hiệu năng phản hồi (`GET /products` < 500ms, đặt+thanh toán < 1000ms) | Toàn hệ thống | Architecture-01 §7/§10, Deployment-01 | Toàn bộ API NestJS | PERF-T01 | Sẵn sàng (Task 1) |
| **NFR-02** | Bảo mật: Bcrypt, JWT Guard, RBAC, `class-validator` | UC-05, UC-06, UC-07, UC-08 | Activity-01, Sequence-01, Class-01 (`User`, `UserRole`), Architecture-01 §9, ADR-008 | Guards, Pipes, `.env` + `.gitignore` | SEC-T01 | Đã hoàn thành (CV08) |
| **NFR-03** | Tính khả dụng Mobile-First & PWA | Toàn hệ thống | Architecture-01 §6, ADR-003, ADR-009 | Frontend Next.js PWA (Manifest, icon) | UI-E2E-T01 | Sẵn sàng (Task 1) |
| **NFR-04** | CI/CD Quality Gate & Docker Deploy | Toàn hệ thống | Architecture-01 §11, ADR-001, ADR-006, Deployment-01 | GitHub Actions, Dockerfile, `docker-compose.yml` | CI-T01 | Đã hoàn thành |
| **NFR-05** | Toàn vẹn dữ liệu & Concurrency Lock, Idempotency | UC-07, UC-08 | Activity-01, Sequence-01, Class-01 (`Product.stock`, `Product.version`, `Payment.idempotencyKey`), Architecture-01 §7/§8, ADR-004, ADR-005 | Transaction + Optimistic Locking (`version`) + `Idempotency-Key` | CONC-T01, INT-T03 | Đã hoàn thành (CV17, CV18) |

## 3. Quy ước mã tạo phẩm thiết kế (Task 2 & 3)

Các mã sơ đồ dùng trong cột "Thiết kế / Sơ đồ" ở trên trỏ tới các tệp sau:

| Mã sơ đồ | Tệp nguồn | Bản kết xuất | Trạng thái |
| :--- | :--- | :--- | :--- |
| Activity-01 | `docs/diagrams/activity-checkout.puml` | `docs/diagrams/activity-checkout.svg` | Đã có (Task 2) |
| Sequence-01 | `docs/diagrams/sequence-checkout.puml` | `docs/diagrams/sequence-checkout.svg` | Đã có (Task 2) |
| Class-01 | `docs/diagrams/class-diagram.puml` | `docs/diagrams/class-diagram.svg` | Đã có (Task 2) |
| Architecture-01 | `docs/architecture/architecture.md` | — | Đã có (Task 3.1) |
| ADR-001..009 | `docs/architecture/adr/` | — | Đã có (Task 3.1) |
| Deployment-01 | `docs/deployment.md` + `docs/diagrams/deployment.puml` | `docs/diagrams/deployment.svg` | Đã có (Task 3.2) |

## 4. Truy vết kiến trúc Task 3

Bảng dưới đây nối yêu cầu Task 1 với quyết định kiến trúc/ADR và node triển khai Task 3. Mã nguồn/test tương ứng sẽ được hiện thực ở Task 4–5 và cập nhật lại trong các cột "Code / API" và "Test Case" ở §1–§2.

| Mã yêu cầu | Thành phần kiến trúc | ADR / tài liệu | Node deployment |
| :--- | :--- | :--- | :--- |
| FR-01, FR-02, FR-03 | Next.js menu/chi tiết/cart, `ProductsModule`, `PricingPolicy` | ADR-003, ADR-009, `architecture.md` §4/§6 | Render Web (Next.js) → Render API → PostgreSQL |
| FR-04 | `AuthModule`, `UsersModule`, JWT Guard/RolesGuard (thực tế: không có `UsersModule`/`RolesGuard` riêng) | ADR-008 | Render API → PostgreSQL |
| FR-05, FR-08 | `OrdersModule`, `Order.assertTransition()` (`OrderStateMachine`), transaction `Serializable` + optimistic locking (thiết kế gốc: `FOR UPDATE`) | ADR-002, ADR-004 | Render API → PostgreSQL |
| FR-06 | `PaymentsModule`, `PaymentGateway`, `MockPaymentGateway`, reconciliation job (thực tế: mock nằm trong `PaymentsService`, chưa có port/job) | ADR-005, `architecture.md` §8 | Render API (in-process mock) → PostgreSQL |
| FR-07 | `OrdersModule`, `GET /orders/me`, Next.js history | ADR-003, ADR-004 | Render Web (Next.js) → Render API → PostgreSQL |
| FR-09 | `PromotionsModule`, `PromotionPolicy`, khóa row | ADR-004 | Render API → PostgreSQL |
| FR-10 | `LoyaltyModule`, `LoyaltyTransaction`, post-commit hook (idempotent) | ADR-002, ADR-004 | Render API → PostgreSQL |
| FR-14 | `HealthModule`, `/health`, `/health/ready`, migration/seed | ADR-007, ADR-004 | Render health check / Docker / CI smoke |
| NFR-01 | Index DB, select tối ưu, PWA cache, 1 API instance | ADR-004, ADR-006 | Render + PostgreSQL |
| NFR-02 | Bcrypt, JWT, kiểm tra role trong controller/service (thiết kế gốc: Roles Guard), ValidationPipe, secret ngoài repo | ADR-007, ADR-008 | Render/GitHub Secrets |
| NFR-03 | Next.js mobile-first, manifest, service worker (thực tế: chưa có service worker) | ADR-003, ADR-009 | User Device → Render Web (Next.js) |
| NFR-04 | Docker, GitHub Actions, GHCR, Render, health/rollback | ADR-001, ADR-006, `deployment.md` | GitHub Actions → GHCR → Render |
| NFR-05 | Transaction `Serializable` + optimistic locking (thiết kế gốc: `SELECT FOR UPDATE`), UNIQUE, state machine | ADR-004, ADR-005 | Render API → PostgreSQL |

## 5. Truy vết thành phần → mã nguồn (CV13)

Bảng đầy đủ (đường dẫn thực tế + trạng thái Đủ/Khác/Chưa cho từng thành phần) nằm ở [`architecture/architecture.md`](./architecture/architecture.md) §13.2. Trạng thái hiện thực của từng quyết định nằm ở cuối mỗi [ADR](./architecture/adr/README.md) (CV14).
