ALTER TABLE "ServiceTicket"
    ADD COLUMN "repairStartedAt" TIMESTAMP(3),
    ADD COLUMN "repairSignerName" TEXT,
    ADD COLUMN "repairSignatureId" TEXT,
    ADD COLUMN "laborRateSnapshot" DECIMAL(8,2);

CREATE TABLE "ServiceLabourRate" (
    "id" TEXT NOT NULL,
    "hourlyRate" DECIMAL(8,2) NOT NULL CHECK ("hourlyRate" >= 0),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceLabourRate_pkey" PRIMARY KEY ("id")
);
