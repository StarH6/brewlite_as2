# ADR-001: Monorepo với pnpm workspaces

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: đã hiện thực (Docker production chưa có). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: NFR-04, ADR-006

## Bối cảnh

BrewLite gồm frontend Next.js, backend NestJS và toàn bộ tài liệu Task 1–5. Nhóm nhỏ, thời gian ngắn, cần một pipeline CI duy nhất và tránh lệch phiên bản giữa web/API. Repository hiện đã có `docs/` và cấu trúc đích `apps/web`, `apps/api`.

## Các lựa chọn đã cân nhắc

1. **Polyrepo**: repository riêng cho web, API và docs.
2. **Monorepo pnpm workspaces**: `apps/web`, `apps/api`, `docs/` trong một repository.
3. **Monorepo có Nx/Turborepo**: thêm cache và task graph.

## Quyết định

Chọn phương án **2**:

- `pnpm-workspace.yaml` khai báo `apps/*`.
- Root `package.json` giữ các script `lint`, `test`, `build`, `prisma:generate` để CI chạy một lần cho toàn repo.
- Dockerfile của từng app copy đúng workspace/manifest cần thiết.
- Tài liệu Task 1–5 nằm trong `docs/`, được version hóa cùng mã nguồn.

## Hệ quả

**Tích cực**

- Một PR có thể thay đổi xuyên web/API/docs và cập nhật traceability trong cùng commit.
- Một pipeline, một lịch sử commit, một nơi cấu hình format/lint.
- Dễ clone và chạy `docker compose up` cho cả hệ thống.

**Tiêu cực**

- Mọi thay đổi đều checkout cả repo; CI có thể chạy nhiều việc không liên quan nếu không lọc theo path.
- Dễ tạo phụ thuộc chéo giữa `apps/web` và `apps/api`; cần review ranh giới.
- Docker context lớn hơn; cần `.dockerignore` đúng.

**Giảm thiểu**

- Chưa thêm Nx/Turborepo; chỉ thêm khi build chậm thực sự.
- Không import code giữa web và API; chia sẻ contract qua REST/JSON, không qua package nội bộ.
- CI có thể lọc path ở Task 4.4 nếu cần.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Đã hiện thực – có điều chỉnh nhỏ
- **Đúng thiết kế**: `pnpm-workspace.yaml` khai báo `apps/*`; root `package.json` có script `lint`, `test`, `build`, `prisma:generate`; CI (`.github/workflows/ci.yml`) chạy các script này một lần cho toàn repo.
- **Khác thiết kế**: Docker hiện chỉ có `Dockerfile.dev` + `docker-compose.yml` ở thư mục gốc (chạy dev); `apps/api/Dockerfile` và `apps/web/Dockerfile` cho production **chưa có** (Task 4.4/5.3).
- **Quyết định vẫn giữ nguyên**; không cần ADR mới.
