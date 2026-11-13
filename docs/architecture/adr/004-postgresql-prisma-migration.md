# ADR-004: PostgreSQL + Prisma Migrate

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: đã hiện thực, cơ chế khóa khác thiết kế. Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: FR-05, FR-06, FR-09, FR-10, NFR-05, NFR-04

## Bối cảnh

Cần CSDL quan hệ cho order/payment với transaction, unique constraint và khóa row. Task 1 đã chọn PostgreSQL và Prisma. Cần migration tái tạo được DB ở local, CI và production, đồng thời có chiến lược rollback an toàn.

## Các lựa chọn đã cân nhắc

1. **PostgreSQL + Prisma** (schema, migrate, client type-safe).
2. PostgreSQL + TypeORM.
3. PostgreSQL + Knex/SQL thuần.
4. SQLite cho demo.

## Quyết định

Chọn phương án **1**:

- Schema tại `apps/api/prisma/schema.prisma`; migration SQL commit trong `apps/api/prisma/migrations/`.
- Local: `prisma migrate dev`; production: `prisma migrate deploy` trước khi start API (entrypoint hoặc pre-deploy command).
- Seed idempotent bằng `upsert`; dữ liệu mẫu gồm Product (>= 100), size S/M/L, topping, promotion.
- Khóa row dùng `SELECT ... FOR UPDATE` cho `Order`, `Product`, `Promotion`.
- Ràng buộc quan trọng: `Payment @@unique(userId, orderId, idempotencyKey)`, `LoyaltyTransaction @@unique(orderId, type)`, `Promotion.code @unique`, `Order.orderCode @unique`.
- Migration **forward-only**; rollback code bằng image cũ, rollback dữ liệu bằng backup/restore.

## Hệ quả

**Tích cực**

- Type-safe, migration có version, dễ seed và test.
- Hỗ trợ transaction, unique, index và raw SQL khi cần `FOR UPDATE`.
- PostgreSQL đúng yêu cầu Task 1; chạy được bằng Docker Compose.

**Tiêu cực**

- Migration lúc container start có thể chạy đồng thời nếu scale nhiều instance.
- Không tự động down migration; rollback dữ liệu phụ thuộc backup.
- Prisma thêm generated client vào image; cần `prisma generate` trong build.

**Giảm thiểu**

- MVP chạy **một instance API**; khi scale, chuyển migration sang release job/pre-deploy riêng.
- Backup trước migration production; ghi rõ RPO/RTO thực tế của gói Render.
- Kiểm tra migration trên DB sạch và DB có dữ liệu trước khi deploy.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Đã hiện thực – khác thiết kế ở cơ chế khóa
- **Đúng thiết kế**: PostgreSQL + Prisma Migrate (forward-only), schema ở `apps/api/prisma/schema.prisma`, migration `20261020120000_init` và `20261025130000_add_product_version`, seed ở `apps/api/prisma/seed.ts`; kết quả tính tiền do server tính, snapshot giá trong `OrderItem`/`OrderItemOption`.
- **Khác thiết kế (quan trọng)**: tạo đơn **không** dùng `SELECT ... FOR UPDATE` mà dùng transaction `Serializable` + **optimistic locking** (cột `Product.version`, `updateMany` có điều kiện `stock >= qty`). Hủy đơn/thanh toán chốt trạng thái bằng `updateMany where status = <đã đọc>`. Mục tiêu NFR-05 (không oversell, không double-charge) vẫn đạt và có test đồng thời (`orders.concurrency.e2e.spec.ts`, `payments.idempotency.e2e.spec.ts`).
- **Hệ quả của khác biệt**: khi tranh chấp cao có thể gặp lỗi serialization/xung đột và cần client thử lại; chấp nhận được với quy mô đồ án.
- **Ghi chú tài liệu**: `architecture.md` §7.3 giữ pseudo-code `FOR UPDATE` làm thiết kế gốc và có khối "Hiện thực thực tế" mô tả cách đang chạy. Nếu nhóm muốn chính thức hóa, tạo ADR-010 "Optimistic locking + Serializable" và đánh dấu mục khóa của ADR-004 là Superseded (theo quy ước README).
