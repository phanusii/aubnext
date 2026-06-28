-- ประวัติการเข้าดูผลคะแนน (1 แถวต่อนักเรียนต่อรอบสอบ)
CREATE TABLE IF NOT EXISTS "ResultView" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "examNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResultView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ResultView_examSessionId_examNo_key" ON "ResultView"("examSessionId", "examNo");
CREATE INDEX IF NOT EXISTS "ResultView_examSessionId_idx" ON "ResultView"("examSessionId");

DO $$ BEGIN
  ALTER TABLE "ResultView" ADD CONSTRAINT "ResultView_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
