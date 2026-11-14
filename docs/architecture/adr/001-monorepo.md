# ADR-001: Monorepo bằng pnpm workspaces

**Trạng thái:** Accepted – đã triển khai.

## Bối cảnh

BrewLite có Next.js frontend, NestJS backend và tài liệu kiến trúc. Nhóm muốn quản lý chúng tập trung để thuận tiện phát triển và review.

## Quyết định

Giữ **một repository** với `apps/web/`, `apps/api/`, `docs/` và `pnpm-workspace.yaml` (`apps/*`). Các script ở root cho phép chạy build, lint, test và migration theo workspace.

## Lý do / ưu điểm

Đồng bộ code và tài liệu trong cùng commit, dễ phối hợp nhóm, thiết lập môi trường đơn giản hơn so với nhiều repo.

## Hạn chế / trade-off

CI có thể chạy thừa việc khi repo lớn, nguy cơ phụ thuộc chéo giữa frontend/backend. Chấp nhận vì quy mô đồ án nhỏ; frontend và backend trao đổi qua REST/JSON.
