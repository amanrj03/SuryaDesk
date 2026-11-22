ALTER TABLE "Payment" ALTER COLUMN "recordedById" DROP NOT NULL;

CREATE TABLE "RazorpayCheckout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('orders', 'invoices')),
    "targetId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL CHECK ("amountPaise" > 0),
    "providerOrderId" TEXT NOT NULL UNIQUE,
    "providerPaymentId" TEXT UNIQUE,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RazorpayCheckout_kind_targetId_amountPaise_key"
    ON "RazorpayCheckout"("kind", "targetId", "amountPaise");
