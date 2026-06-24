-- ธงนักเรียนไม่ได้เข้าสอบ
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "absent" BOOLEAN NOT NULL DEFAULT false;
