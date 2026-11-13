# ADR-006: Nền tảng triển khai Render + GHCR

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: chưa hiện thực (mới có CI). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: NFR-04, FR-14, Deployment-01

## Bối cảnh

Nhóm cần môi trường production truy cập được qua HTTPS, phục vụ Next.js, chạy container NestJS, PostgreSQL có persistent storage, và một pipeline CI/CD có rollback. Task 1 ràng buộc dùng Docker & Docker Compose để container hóa môi trường local, CI và production; ngân sách/thời gian đồ án hạn chế nên nhóm không muốn tự quản trị VPS.

## Các lựa chọn đã cân nhắc

1. **Render cho cả web/API/Postgres + GHCR**: hai Render Web Service chạy Docker image (Next.js và NestJS), một Render Managed Postgres, image lưu ở GHCR.
2. **Vercel (web) + Render (API/Postgres) + GHCR**: Vercel tối ưu Next.js nhưng web không chạy Docker, lệch ràng buộc “container hóa production” của Task 1 và thêm một nhà cung cấp.
3. Railway cho cả web/API/DB.
4. VPS tự quản lý (Docker Compose + Nginx + Certbot).
5. Fly.io cho API/Postgres.

## Quyết định

Chọn phương án **1**:

- **Next.js Web** và **NestJS API** đều đóng gói Docker, push **GHCR**, Render Web Service pull image theo tag `sha-<commit>`/semver.
- **PostgreSQL** dùng **Render Managed Postgres**, chỉ truy cập qua internal URL + SSL.
- **GitHub Actions** là CI/CD duy nhất; deploy từng service bằng Render deploy hook/API.
- Secret đặt ở Render Environment và GitHub Secrets.
- Render cung cấp HTTPS cho cả hai web service; static asset của Next.js được phục vụ qua hạ tầng Render (mức CDN/cache tùy gói, kiểm tra khi tạo service).
- Local/CI dùng **Docker Compose**; production dùng cùng Docker image trên Render. Task 1 yêu cầu container hóa production; cách hiện thực là Docker image + managed platform, không chạy Compose trong production.

## Hệ quả

**Tích cực**

- Một nhà cung cấp production; ít biến môi trường và ít luồng deploy hơn.
- Cả web và API đều chạy Docker, đúng ràng buộc Task 1 và dễ tái sử dụng Dockerfile của local/CI.
- Render có managed Postgres, private networking, health check và log tập trung.
- GHCR miễn phí cho public image; image tag giúp rollback và truy vết commit.
- Frontend/backend vẫn deploy độc lập trong cùng nền tảng.

**Tiêu cực**

- Phụ thuộc Render và GHCR.
- Cold start/giới hạn tài nguyên ở gói thấp; CDN/cache của Render có thể không mạnh bằng Vercel.
- Render không tự chạy migration nếu không cấu hình entrypoint/pre-deploy.
- Giá/gói dịch vụ thay đổi; cần kiểm tra trang chính thức trước khi nộp.

**Điều kiện áp dụng**

- Tạo GitHub repo, bật branch protection cho `main`.
- Tạo Render Postgres, hai Render Web Service từ GHCR, đặt env/secret, health check.
- Đặt `RENDER_DEPLOY_HOOK_WEB_URL`, `RENDER_DEPLOY_HOOK_API_URL`, `API_HEALTH_URL` trong GitHub Secrets.
- Build `NEXT_PUBLIC_API_URL` trỏ tới API production **trước khi** build web image.
- Chạy migration/seed lần đầu; smoke test `/health`; kiểm tra web qua HTTPS.
- Ghi URL thật vào README/release notes ở Task 5.4.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Chưa hiện thực (kế hoạch)
- **Đã có**: CI (`.github/workflows/ci.yml`) cho PR vào `main`/`dev`; `GET /health` và `/health/ready` phục vụ health check; validate env fail-fast ở production.
- **Chưa có**: workflow CD (`cd.yml`), đẩy image lên GHCR, Dockerfile production, dịch vụ Render (web/API/Postgres) và URL production. `docker-compose.yml` hiện chỉ dùng cho môi trường dev.
- Quyết định nền tảng vẫn giữ nguyên; việc triển khai thuộc Task 4.4/5.3.
