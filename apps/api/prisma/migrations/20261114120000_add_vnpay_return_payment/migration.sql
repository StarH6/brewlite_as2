ALTER TABLE "Payment"
ADD COLUMN "provider" VARCHAR(20) NOT NULL DEFAULT 'mock',
ADD COLUMN "providerTxnRef" VARCHAR(64),
ADD COLUMN "paymentUrl" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "responseCode" VARCHAR(10),
ADD COLUMN "transactionStatus" VARCHAR(10),
ADD COLUMN "bankCode" VARCHAR(20),
ADD COLUMN "payDate" TIMESTAMP(3),
ADD COLUMN "refundRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Payment_providerTxnRef_key" ON "Payment"("providerTxnRef");
