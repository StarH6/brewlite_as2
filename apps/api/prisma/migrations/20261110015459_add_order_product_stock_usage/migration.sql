/*
  Warnings:

  - You are about to alter the column `stock` on the `Ingredient` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.
  - You are about to alter the column `quantity` on the `OrderIngredientUsage` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.
  - You are about to alter the column `quantityPerServing` on the `ProductIngredient` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.

*/
-- AlterTable
ALTER TABLE "Ingredient" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "OrderIngredientUsage" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductIngredient" ALTER COLUMN "quantityPerServing" SET DATA TYPE DECIMAL(12,3);

-- CreateTable
CREATE TABLE "ProductOptionIngredient" (
    "optionId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ProductOptionIngredient_pkey" PRIMARY KEY ("optionId","ingredientId")
);

-- CreateTable
CREATE TABLE "OrderProductStockUsage" (
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderProductStockUsage_pkey" PRIMARY KEY ("orderId","productId")
);

-- CreateIndex
CREATE INDEX "ProductOptionIngredient_ingredientId_idx" ON "ProductOptionIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "OrderProductStockUsage_productId_idx" ON "OrderProductStockUsage"("productId");

-- AddForeignKey
ALTER TABLE "ProductOptionIngredient" ADD CONSTRAINT "ProductOptionIngredient_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("optionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionIngredient" ADD CONSTRAINT "ProductOptionIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("ingredientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductStockUsage" ADD CONSTRAINT "OrderProductStockUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductStockUsage" ADD CONSTRAINT "OrderProductStockUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;
