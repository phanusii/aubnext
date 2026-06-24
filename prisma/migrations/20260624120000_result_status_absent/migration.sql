-- เพิ่มสถานะ ABSENT (ไม่ได้เข้าสอบ) ใน ResultStatus
ALTER TYPE "ResultStatus" ADD VALUE IF NOT EXISTS 'ABSENT';
