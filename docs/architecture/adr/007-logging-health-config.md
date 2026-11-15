# ADR-007: Logging, Health Check và quản lý cấu hình

**Trạng thái:** Accepted 

## Bối cảnh

Backend cần ghi nhận lỗi, kiểm tra trạng thái chạy và tránh lỗi do thiếu biến môi trường.

## Quyết định

- **Logging:** Dùng `Logger` mặc định của NestJS trong các service và lúc khởi động.
- **Health check:** `GET /health` kiểm tra API còn hoạt động; `GET /health/ready` dùng Prisma `SELECT 1` để xác nhận kết nối PostgreSQL (DB lỗi trả HTTP 503).
- **Config:** Dùng `ConfigModule.forRoot({validate: validateEnv})`, đọc env (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `PAYMENT_PROVIDER`...) và kiểm tra giá trị khi khởi động.

## Lý do / ưu điểm

Dễ thực hiện, không cần hệ thống giám sát riêng, phát hiện nhanh lỗi cấu hình và tình trạng database.

## Hạn chế / trade-off

Chưa có JSON structured logging và request ID thống nhất; `LOG_LEVEL` mới được validate, chưa điều khiển toàn bộ logging. Chấp nhận cho phạm vi đồ án; có thể mở rộng về sau.
