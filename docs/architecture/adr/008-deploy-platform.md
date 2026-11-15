
# ADR-008: Triển khai BrewLite trên Railway

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-14
- **Liên quan:** ADR-001, ADR-002, ADR-004

## 1. Bối cảnh

BrewLite sử dụng Next.js cho frontend, NestJS cho backend và PostgreSQL để lưu trữ dữ liệu.

Nhóm cần một nền tảng triển khai đơn giản, dễ quản lý, không phải tự cấu hình máy chủ hay xây dựng hệ thống CI/CD phức tạp.

## 2. Các phương án

1. **Railway:** Hỗ trợ triển khai ứng dụng và PostgreSQL trong cùng một nền tảng, kết nối trực tiếp với GitHub.
2. **Render:** Hỗ trợ triển khai web, API và database nhưng phương án Render + GHCR ban đầu cần cấu hình thêm.
3. **VPS:** Cho phép tự quản lý hệ thống nhưng phải cấu hình server, database và bảo mật.

## 3. Quyết định

Nhóm quyết định sử dụng **Railway** để triển khai hệ thống BrewLite.

Kiến trúc triển khai gồm:

- **Frontend:** Next.js được triển khai thành một service trên Railway.
- **Backend:** NestJS được triển khai thành một service riêng.
- **Database:** PostgreSQL được tạo và quản lý trên Railway.
- **Migration:** Sử dụng Prisma Migrate để cập nhật cấu trúc database.
- **Configuration:** Sử dụng Environment Variables trên Railway để quản lý thông tin cấu hình và secret.
- **Deployment:** Kết nối GitHub để hỗ trợ triển khai khi có thay đổi mã nguồn.

## 4. Lý do lựa chọn

- Dễ cấu hình và triển khai đối với nhóm sinh viên.
- Hỗ trợ Next.js, NestJS và PostgreSQL.
- Tích hợp trực tiếp với GitHub.
- Không cần tự quản lý VPS hoặc Docker Registry.
- Phù hợp với quy mô và thời gian thực hiện đồ án.

## 5. Ưu điểm

- Quản lý frontend, backend và database trên cùng một nền tảng.
- Giảm thời gian cấu hình môi trường triển khai.
- Dễ theo dõi trạng thái ứng dụng và nhật ký hoạt động.
- Hỗ trợ quản lý biến môi trường.
- Thuận tiện cập nhật ứng dụng từ GitHub.

## 6. Hạn chế và trade-off

- Phụ thuộc vào nền tảng Railway.
- Chi phí phụ thuộc tài nguyên sử dụng.
- Vẫn cần cấu hình biến môi trường, domain và lệnh build/start.
- Ít quyền kiểm soát hạ tầng hơn so với tự triển khai VPS.
- Cần quản lý migration và sao lưu dữ liệu PostgreSQL.

## 7. Kết luận

Nhóm lựa chọn **Railway** thay cho Render vì ưu tiên sự đơn giản, dễ triển khai và quản lý.

Đây là sự đánh đổi giữa khả năng kiểm soát hạ tầng và sự thuận tiện, phù hợp với phạm vi đồ án BrewLite.
