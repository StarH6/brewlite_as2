-- Migration khởi tạo BrewLite
-- Nguồn: apps/api/prisma/schema.prisma
-- Lưu ý: migration là forward-only (ADR-004).

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'HIDDEN');
CREATE TYPE "OptionType" AS ENUM ('SIZE', 'TOPPING');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PAYMENT_FAILED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'CARD');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PAID', 'FAILED');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "PromotionStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LoyaltyType" AS ENUM ('EARN', 'REVERSAL');

-- CreateTable
CREATE TABLE "User" (
    "userId" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Product" (
    "productId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Product_pkey" PRIMARY KEY ("productId")
);

CREATE TABLE "ProductOption" (
    "optionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "OptionType" NOT NULL,
    "priceAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("optionId")
);

CREATE TABLE "Order" (
    "orderId" UUID NOT NULL,
    "orderCode" VARCHAR(32) NOT NULL,
    "userId" UUID NOT NULL,
    "promotionId" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("orderId")
);

CREATE TABLE "OrderItem" (
    "orderItemId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("orderItemId")
);

CREATE TABLE "OrderItemOption" (
    "orderItemOptionId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "optionName" VARCHAR(60) NOT NULL,
    "optionType" "OptionType" NOT NULL,
    "priceAdjustment" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("orderItemOptionId")
);

CREATE TABLE "Payment" (
    "paymentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "transactionReference" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("paymentId")
);

CREATE TABLE "Promotion" (
    "promotionId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "maxDiscount" DECIMAL(12,2),
    "minimumOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("promotionId")
);

CREATE TABLE "LoyaltyTransaction" (
    "transactionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "LoyaltyType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("transactionId")
);


-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_name_idx" ON "Product"("name");

CREATE UNIQUE INDEX "ProductOption_productId_name_type_key" ON "ProductOption"("productId", "name", "type");
CREATE INDEX "ProductOption_productId_idx" ON "ProductOption"("productId");

CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");

CREATE UNIQUE INDEX "Payment_userId_orderId_idempotencyKey_key" ON "Payment"("userId", "orderId", "idempotencyKey");
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
CREATE INDEX "Promotion_status_startAt_endAt_idx" ON "Promotion"("status", "startAt", "endAt");

CREATE UNIQUE INDEX "LoyaltyTransaction_orderId_type_key" ON "LoyaltyTransaction"("orderId", "type");
CREATE INDEX "LoyaltyTransaction_userId_createdAt_idx" ON "LoyaltyTransaction"("userId", "createdAt");


-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("promotionId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("orderItemId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints (NFR-05 / architecture §7.2)
ALTER TABLE "User" ADD CONSTRAINT "User_loyaltyPoints_nonnegative" CHECK ("loyaltyPoints" >= 0);

ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_basePrice_nonnegative" CHECK ("basePrice" >= 0);

ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_priceAdjustment_nonnegative" CHECK ("priceAdjustment" >= 0);

ALTER TABLE "Order" ADD CONSTRAINT "Order_subtotal_nonnegative" CHECK ("subtotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountAmount_nonnegative" CHECK ("discountAmount" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_totalAmount_nonnegative" CHECK ("totalAmount" >= 0);

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPrice_nonnegative" CHECK ("unitPrice" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_subtotal_nonnegative" CHECK ("subtotal" >= 0);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_nonnegative" CHECK ("amount" >= 0);

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_discountValue_nonnegative" CHECK ("discountValue" >= 0);
