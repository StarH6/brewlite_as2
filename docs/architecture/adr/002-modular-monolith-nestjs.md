# ADR-002: Kiến trúc phân lớp và NestJS modular monolith

**Trạng thái:** Accepted.

## Bối cảnh

Hệ thống cần phân chia rõ phần giao tiếp HTTP, xử lý đơn/thanh toán và truy cập PostgreSQL. Quy mô đồ án chưa cần các microservice độc lập.

## Quyết định

Dùng **Layered Architecture**: Presentation (Next.js) → Interface (NestJS Controller/DTO/Guard) → Application/Domain (Service, policy, state machine) → Infrastructure (Prisma/PostgreSQL). Backend là **một NestJS API** chia module theo nghiệp vụ: `auth`, `products`, `orders`, `payments`, `promotions`, `loyalty`, `ingredients`, cùng các module hỗ trợ.

## Lý do / ưu điểm

Dễ học, dễ test, các phần có trách nhiệm rõ; transaction và quản lý dữ liệu đơn giản hơn microservices.

## Hạn chế / trade-off

Không scale từng module độc lập; service có thể phụ thuộc chéo nếu thiếu kỷ luật.
