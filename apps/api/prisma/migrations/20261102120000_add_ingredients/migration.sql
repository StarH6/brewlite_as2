-- Thêm nguyên liệu, công thức món và lượng nguyên liệu đã trừ theo đơn.
-- Migration forward-only (ADR-004), không đổi dữ liệu cũ.

-- CreateTable
CREATE TABLE "Ingredient" (
    "ingredientId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("ingredientId")
);

CREATE TABLE "ProductIngredient" (
    "productId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantityPerServing" INTEGER NOT NULL,

    CONSTRAINT "ProductIngredient_pkey" PRIMARY KEY ("productId","ingredientId")
);

CREATE TABLE "OrderIngredientUsage" (
    "orderId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderIngredientUsage_pkey" PRIMARY KEY ("orderId","ingredientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");
CREATE INDEX "ProductIngredient_ingredientId_idx" ON "ProductIngredient"("ingredientId");
CREATE INDEX "OrderIngredientUsage_ingredientId_idx" ON "OrderIngredientUsage"("ingredientId");

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("ingredientId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderIngredientUsage" ADD CONSTRAINT "OrderIngredientUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderIngredientUsage" ADD CONSTRAINT "OrderIngredientUsage_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("ingredientId") ON DELETE RESTRICT ON UPDATE CASCADE;
