ALTER TABLE "SchoolSettings"
  ADD COLUMN IF NOT EXISTS "adminEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "adminPasswordHash" TEXT;
