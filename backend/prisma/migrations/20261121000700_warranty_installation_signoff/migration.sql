BEGIN;

-- Preserve legacy records and their replacement links while withholding coverage until sign-off.
UPDATE "Warranty" AS warranty
SET status = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP
WHERE warranty.status IN ('ACTIVE', 'EXPIRED')
  AND NOT EXISTS (
    SELECT 1 FROM "Installation" AS job
    WHERE job."orderId" = warranty."orderId" AND job.status = 'COMPLETED' AND job."signedAt" IS NOT NULL
  );

-- Calculate the expiry in India local time, including month-end clamping.
UPDATE "Warranty" AS warranty
SET "startAt" = CASE WHEN warranty."originalWarrantyId" IS NULL THEN job."signedAt"
                     ELSE GREATEST(warranty."startAt", job."signedAt") END,
    "endAt" = job."signedAt" + INTERVAL '5 hours 30 minutes'
              + make_interval(months => warranty.months) - INTERVAL '5 hours 30 minutes',
    status = CASE WHEN warranty.status = 'EXPIRED' THEN 'ACTIVE'::"WarrantyStatus" ELSE warranty.status END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Installation" AS job
WHERE job."orderId" = warranty."orderId" AND job.status = 'COMPLETED' AND job."signedAt" IS NOT NULL;

COMMIT;
