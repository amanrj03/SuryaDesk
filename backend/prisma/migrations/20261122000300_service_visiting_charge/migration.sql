ALTER TABLE "ServiceLabourRate"
    ADD COLUMN "visitCharge" DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK ("visitCharge" >= 0);

ALTER TABLE "ServiceTicket"
    ADD COLUMN "visitCharge" DECIMAL(8,2) NOT NULL DEFAULT 0;
