CREATE TABLE IF NOT EXISTS "LineBinding" (
  "id" TEXT NOT NULL,
  "lineUserId" TEXT NOT NULL,
  "lineName" TEXT,
  "studentId" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LineBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LineNotificationLog" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LineNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LineBinding_lineUserId_examSessionId_key" ON "LineBinding"("lineUserId", "examSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "LineBinding_studentId_examSessionId_key" ON "LineBinding"("studentId", "examSessionId");
CREATE INDEX IF NOT EXISTS "LineBinding_examSessionId_idx" ON "LineBinding"("examSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "LineNotificationLog_bindingId_examSessionId_key" ON "LineNotificationLog"("bindingId", "examSessionId");
CREATE INDEX IF NOT EXISTS "LineNotificationLog_examSessionId_status_idx" ON "LineNotificationLog"("examSessionId", "status");

ALTER TABLE "LineBinding"
  ADD CONSTRAINT "LineBinding_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LineBinding"
  ADD CONSTRAINT "LineBinding_examSessionId_fkey"
  FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LineNotificationLog"
  ADD CONSTRAINT "LineNotificationLog_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "LineBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LineNotificationLog"
  ADD CONSTRAINT "LineNotificationLog_examSessionId_fkey"
  FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
