# ADR-003: Next.js App Router và PWA mức cơ bản

**Trạng thái:** Accepted

## Bối cảnh

Khách sử dụng BrewLite chủ yếu qua trình duyệt, bao gồm điện thoại, nên cần giao diện web thân thiện và có khả năng mở như ứng dụng.

## Quyết định

Dùng **Next.js App Router + React + TypeScript** trong `apps/web/`. Khai báo **Web App Manifest** tại `apps/web/app/manifest.ts` (`display: standalone`), dùng Zustand cho giỏ hàng và gọi NestJS qua REST API.

## Lý do / ưu điểm

Tận dụng hệ sinh thái React, routing tiện lợi, một giao diện phục vụ cả máy tính và điện thoại, không cần phát triển app native riêng.

## Hạn chế / trade-off

Chưa có service worker/caching offline hoàn chỉnh; ứng dụng cần mạng để đặt hàng. Chưa hỗ trợ offline.
