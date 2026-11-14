# ADR-004: PostgreSQL và Prisma Migrate

**Trạng thái:** Accepted 

## Bối cảnh

Đơn hàng, sản phẩm, thanh toán và tồn kho có quan hệ với nhau; cần transaction và lịch sử thay đổi cấu trúc database.

## Quyết định

Dùng **PostgreSQL** và **Prisma ORM/Migrate**. Schema tại `apps/api/prisma/schema.prisma`; migration được version hóa trong `apps/api/prisma/migrations/`. Dev dùng `pnpm db:migrate`; áp dụng migration đã commit dùng `pnpm db:migrate:deploy` từ root.

## Lý do / ưu điểm

Dữ liệu quan hệ phù hợp nghiệp vụ; transaction, unique constraint và Prisma Client giúp giảm lỗi; migration cho phép đồng bộ cấu trúc DB giữa các môi trường.

## Hạn chế / trade-off

Migration không tự động rollback an toàn; cần kiểm tra trên dữ liệu mẫu và backup khi triển khai. Xử lý tạo đơn có cạnh tranh dùng Serializable transaction và optimistic locking, có thể phát sinh xung đột cần retry.
