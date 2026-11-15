-- Thêm lý do/thời điểm/người hủy đơn để phân biệt khách, nhân viên và hệ thống.
-- Migration forward-only (ADR-004), không đổi dữ liệu cũ.

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM_EXPIRED');

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "cancelReason" "CancelReason",
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledBy" UUID;
