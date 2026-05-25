DO $$
BEGIN
  CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SelectionMode" AS ENUM ('PER_ROOM', 'WHOLE_LEVEL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ResultStatus" AS ENUM ('PASSED', 'FAILED', 'REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SchoolSettings" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "schoolName" TEXT NOT NULL DEFAULT 'โรงเรียนตัวอย่าง',
  "examTitle" TEXT NOT NULL DEFAULT 'ประกาศผลสอบแข่งขัน',
  "logoUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExamSession" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "classLevel" TEXT NOT NULL,
  "selectionMode" "SelectionMode" NOT NULL DEFAULT 'PER_ROOM',
  "wholeLevelQuota" INTEGER,
  "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subject" (
  "id" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "maxScore" DOUBLE PRECISION,
  "isTieBreak" BOOLEAN NOT NULL DEFAULT false,
  "tieBreakOrder" INTEGER,

  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Student" (
  "id" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "examNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "classLevel" TEXT NOT NULL,
  "room" TEXT NOT NULL,
  "verifierHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Score" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,

  CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RoomQuota" (
  "id" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "room" TEXT NOT NULL,
  "quota" INTEGER NOT NULL,

  CONSTRAINT "RoomQuota_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImportBatch" (
  "id" TEXT NOT NULL,
  "examSessionId" TEXT,
  "filename" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rawPreview" JSONB NOT NULL,
  "errors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResultSnapshot" (
  "id" TEXT NOT NULL,
  "examSessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "totalScore" DOUBLE PRECISION NOT NULL,
  "status" "ResultStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "scoreBreakdown" JSONB NOT NULL,
  "tieBreakValues" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ResultSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subject_examSessionId_name_key" ON "Subject"("examSessionId", "name");
CREATE INDEX IF NOT EXISTS "Subject_examSessionId_idx" ON "Subject"("examSessionId");

CREATE UNIQUE INDEX IF NOT EXISTS "Student_examSessionId_examNo_key" ON "Student"("examSessionId", "examNo");
CREATE INDEX IF NOT EXISTS "Student_examSessionId_room_idx" ON "Student"("examSessionId", "room");

CREATE UNIQUE INDEX IF NOT EXISTS "Score_studentId_subjectId_key" ON "Score"("studentId", "subjectId");
CREATE INDEX IF NOT EXISTS "Score_subjectId_idx" ON "Score"("subjectId");

CREATE UNIQUE INDEX IF NOT EXISTS "RoomQuota_examSessionId_room_key" ON "RoomQuota"("examSessionId", "room");

CREATE UNIQUE INDEX IF NOT EXISTS "ResultSnapshot_examSessionId_studentId_key" ON "ResultSnapshot"("examSessionId", "studentId");
CREATE INDEX IF NOT EXISTS "ResultSnapshot_examSessionId_status_idx" ON "ResultSnapshot"("examSessionId", "status");

DO $$
BEGIN
  ALTER TABLE "Subject"
    ADD CONSTRAINT "Subject_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Student"
    ADD CONSTRAINT "Student_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Score"
    ADD CONSTRAINT "Score_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Score"
    ADD CONSTRAINT "Score_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RoomQuota"
    ADD CONSTRAINT "RoomQuota_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ImportBatch"
    ADD CONSTRAINT "ImportBatch_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ResultSnapshot"
    ADD CONSTRAINT "ResultSnapshot_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ResultSnapshot"
    ADD CONSTRAINT "ResultSnapshot_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
