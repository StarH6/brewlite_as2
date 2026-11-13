# ADR-003: Next.js App Router + PWA mức cơ bản

- **Trạng thái**: Accepted – quyết định còn hiệu lực; mức hiện thực: hiện thực một phần (có manifest, chưa có service worker). Xem mục "Trạng thái hiện thực" cuối file
- **Ngày**: 2026-10-19
- **Liên quan**: FR-01, FR-02, FR-03, FR-07, NFR-03

## Bối cảnh

Khách hàng dùng điện thoại, cần mở nhanh, không cài app store. SRS yêu cầu mobile-first/PWA tối thiểu: manifest, theme color, icon, trải nghiệm gần app; đồng thời cần loading/empty/error rõ ràng.

## Các lựa chọn đã cân nhắc

1. **Next.js App Router + manifest metadata route + service worker viết tay**.
2. Next.js + `next-pwa`/Workbox.
3. SPA Vite + PWA plugin.
4. Native app (iOS/Android).

## Quyết định

Chọn phương án **1**:

- Next.js App Router, React, TypeScript.
- `app/manifest.ts` sinh manifest; icon 192/512; theme color; `display: standalone`.
- `public/sw.js` cache app shell và asset same-origin; có `offline.html`.
- Chỉ đăng ký service worker ở production.
- Không cache response API chứa dữ liệu cá nhân; tăng `CACHE_NAME` mỗi lần đổi app shell.
- Layout mobile-first 360–768px; skeleton/spinner, toast, empty state.

## Hệ quả

**Tích cực**

- Ít dependency, dễ hiểu, dễ kiểm soát cache.
- Next.js build/deploy bằng Docker trên Render; PWA không cần app store.
- Phù hợp với API REST/JSON và JWT Bearer đã đặc tả.

**Tiêu cực**

- Cache thủ công dễ serve asset cũ sau deploy.
- Không có offline mutation, background sync hay push notification.
- Install prompt không đồng nhất giữa Chrome/Safari.

**Giảm thiểu**

- Version cache rõ ràng; chỉ cache asset same-origin.
- Test lại luồng chính sau mỗi deploy.
- Ghi nhận offline chỉ ở mức app shell, không hứa hẹn đặt món offline.

## Trạng thái hiện thực (cập nhật 2026-11-09, CV14)

- **Mức hiện thực**: Hiện thực một phần
- **Đã có**: Next.js App Router, các route `/`, `/products/[id]`, `/cart`, `/checkout`, `/orders`, `/login`, `/register`; `apps/web/app/manifest.ts` (`display: standalone`, `lang: vi`).
- **Chưa có**: service worker (`apps/web/public/` đang trống), chiến lược cache app shell, kiểm thử cài đặt PWA; vì vậy chưa đáp ứng đầy đủ phần "service worker" của NFR-03.
- **Việc cần làm**: thêm `public/sw.js` + đăng ký ở client nếu nhóm muốn đạt đúng quyết định; hoặc tạo ADR mới nếu bỏ service worker.
