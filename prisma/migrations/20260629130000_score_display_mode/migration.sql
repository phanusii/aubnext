-- โหมดแสดงคะแนนที่ประกาศ: RAW (คะแนนจริง) หรือ PERCENT (ร้อยละ)
ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "scoreDisplayMode" TEXT NOT NULL DEFAULT 'RAW';
