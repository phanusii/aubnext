-- 1 รหัสนักเรียนผูกได้หลายบัญชี LINE → เอา unique(studentId, examSessionId) ออก แล้วใช้เป็น index แทน
DROP INDEX IF EXISTS "LineBinding_studentId_examSessionId_key";
CREATE INDEX IF NOT EXISTS "LineBinding_studentId_examSessionId_idx" ON "LineBinding"("studentId", "examSessionId");
