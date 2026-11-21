CREATE TABLE "CustomerAccount" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  "customerId" TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "historicalAccess" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CustomerAccount_customerId_idx" ON "CustomerAccount"("customerId");
ALTER TABLE "Lead" ADD COLUMN "portalAccountId" TEXT REFERENCES "CustomerAccount"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD COLUMN "siteAddress" TEXT;
CREATE INDEX "Lead_portalAccountId_idx" ON "Lead"("portalAccountId");
CREATE TABLE "CustomerSession" (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "CustomerAccount"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "CustomerSession_accountId_idx" ON "CustomerSession"("accountId");
CREATE TABLE "CustomerChallenge" (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  digest TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resendAfter" TIMESTAMP(3) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  PRIMARY KEY (email, purpose)
);
CREATE INDEX "CustomerChallenge_expiresAt_idx" ON "CustomerChallenge"("expiresAt");
