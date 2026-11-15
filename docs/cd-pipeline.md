# Pipeline CD: build image và đẩy registry (CV19 – Task 5.3)

Tài liệu này mô tả workflow [`.github/workflows/cd.yml`](../.github/workflows/cd.yml). Workflow mở rộng pipeline CI (lint, test, build) thành: **Push/Tag → lint/test/build → build Docker image → push GHCR**. Hạ tầng deploy (Render) thuộc Task 5.4 nên chưa nằm trong phạm vi này.

## 1. Luồng chạy

```mermaid
flowchart LR
  T["Push main / tag vX.Y.Z / chạy tay"] --> Q["quality-gate<br/>lint, test, build"]
  Q -->|đạt| B1["build-and-push: api"]
  Q -->|đạt| B2["build-and-push: web"]
  B1 --> R["GHCR<br/>ghcr.io/owner/repo/api"]
  B2 --> R2["GHCR<br/>ghcr.io/owner/repo/web"]
  Q -->|lỗi| X["Dừng, không build image"]
```

| Job | Việc làm |
| :--- | :--- |
| `quality-gate` | Cài dependency với `--frozen-lockfile`, generate Prisma Client, chạy `lint`, `test`, `build` giống CI. Lỗi ở bất kỳ bước nào thì dừng, không build image. |
| `build-and-push` | Chạy song song cho `api` và `web` (matrix). Build image từ `apps/<service>/Dockerfile`, gắn tag, push lên GHCR. |

## 2. Kích hoạt

| Sự kiện | Kết quả |
| :--- | :--- |
| Push lên `main` | Build và push, tag `sha-<commit>` và `latest` |
| Push tag `vX.Y.Z` (ví dụ `v1.0.0`) | Build và push, tag `sha-<commit>`, `1.0.0`, `1.0` |
| Chạy tay (Actions → Run workflow) | Như nhánh đang chọn |

PR vào `main`/`dev` vẫn chạy workflow CI cũ (`ci.yml`), không push image.

## 3. Tag và tên image

* Tên image viết thường: `ghcr.io/<owner>/<repo>/api` và `ghcr.io/<owner>/<repo>/web`.
* `sha-<7 ký tự commit>` luôn có, dùng để truy vết và rollback đúng commit.
* Tag phiên bản (`1.0.0`, `1.0`) chỉ có khi push tag `vX.Y.Z`.
* `latest` chỉ cập nhật khi push `main`.

Tạo bản phát hành:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 4. Quản lý secret

* Workflow **không** có secret tự tạo. Đăng nhập GHCR bằng `GITHUB_TOKEN` do Actions cấp, chỉ có quyền `packages: write` trong job build.
* `permissions` mặc định của workflow là `contents: read` (đặc quyền tối thiểu).
* Image **không** chứa secret: `JWT_SECRET`, `DATABASE_URL`... được truyền lúc chạy container, không đưa vào Dockerfile hay build-arg.
* `NEXT_PUBLIC_API_URL` là URL công khai nhúng vào bundle web lúc build. Đặt ở *Settings → Secrets and variables → Actions → Variables* (biến, không phải secret). Nếu chưa đặt, workflow dùng `http://localhost:3000`.
* Không in biến môi trường hay token ra log.

## 5. Dockerfile

| File | Ghi chú |
| :--- | :--- |
| `apps/api/Dockerfile` | 2 stage (build, runtime), Node 22 Alpine, chạy bằng user `node`, có `HEALTHCHECK` gọi `/health`. Giữ `node_modules` đầy đủ để chạy được `prisma migrate deploy` trước khi khởi động. |
| `apps/web/Dockerfile` | 2 stage, dùng `output: standalone` của Next.js nên image nhỏ, chạy bằng user `node`. |

Build thử trên máy:

```bash
docker build -f apps/api/Dockerfile -t brewlite-api:local .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 -t brewlite-web:local .
```

Chạy API (cần PostgreSQL và biến môi trường):

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/brewlite \
  -e JWT_SECRET=<chuỗi ≥ 32 ký tự> \
  brewlite-api:local
```

Chạy migration trước khi khởi động ở môi trường thật:

```bash
docker run --rm -e DATABASE_URL=... brewlite-api:local npx prisma migrate deploy
```

## 6. Cách kiểm tra sau khi chạy

1. Tab **Actions** của repo: workflow *Continuous Delivery (CD)* có 3 job xanh (`quality-gate`, `build-and-push (api)`, `build-and-push (web)`).
2. Trang repo → **Packages**: thấy hai image `api` và `web` với tag `sha-...`.
3. `docker pull ghcr.io/<owner>/<repo>/api:sha-<commit>` kéo được image (nếu package để private cần `docker login ghcr.io` bằng token có quyền `read:packages`).

## 7. Giới hạn hiện tại

* Chưa deploy lên Render và chưa chạy smoke test sau deploy (Task 5.4).
* Chưa quét lỗ hổng image (Trivy) và chưa ký image.
* Image API mang theo dev dependency để dùng Prisma CLI, nên lớn hơn mức tối thiểu; có thể tối ưu sau.
