ALTER TABLE "ResultSnapshot"
  ADD COLUMN IF NOT EXISTS "publicResultData" JSONB,
  ADD COLUMN IF NOT EXISTS "publicResultBuiltAt" TIMESTAMP(3);
