-- AlterTable: Bổ sung trường version phục vụ Optimistic Locking (CV18, NFR-05)
ALTER TABLE "Product" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
