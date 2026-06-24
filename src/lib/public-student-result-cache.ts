import { cacheLife, cacheTag } from "next/cache";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import {
  findPublishedStudentResultSession,
  type PublishedStudentResultLookupResult,
  type PublicStudentResultLookup,
} from "@/lib/repository";

export const publicStudentResultCacheTag = "public-student-results";

function normalizeLookup(lookup: string | PublicStudentResultLookup): PublicStudentResultLookup {
  if (typeof lookup === "string") {
    return { examNo: lookup.trim() };
  }

  return {
    examNo: lookup.examNo.trim(),
    studentId: lookup.studentId,
    examSessionId: lookup.examSessionId,
  };
}

function matchesLookup(session: PublishedStudentResultLookupResult, lookup: PublicStudentResultLookup) {
  if (session.lookup.examNo !== lookup.examNo) return false;
  if (lookup.studentId && session.lookup.studentId !== lookup.studentId) return false;
  if (lookup.examSessionId && session.lookup.examSessionId !== lookup.examSessionId) return false;
  return true;
}

async function getCachedPublishedStudentResultSessionByExamNo(examNo: string) {
  "use cache";
  // args (examNo) เป็น cache key อัตโนมัติ — ไม่ต้องระบุ keyParts เองอีกต่อไป
  cacheTag(publicStudentResultCacheTag, publicSettingsCacheTag);
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  return findPublishedStudentResultSession({ examNo });
}

async function getCachedPublishedStudentResultSessionByLookup(
  examNo: string,
  studentId: string,
  examSessionId: string,
) {
  "use cache";
  cacheTag(publicStudentResultCacheTag, publicSettingsCacheTag);
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  return findPublishedStudentResultSession({
    examNo,
    studentId: studentId || undefined,
    examSessionId: examSessionId || undefined,
  });
}

export async function getCachedPublishedStudentResultSession(lookup: string | PublicStudentResultLookup) {
  const normalized = normalizeLookup(lookup);
  const byExamNo = await getCachedPublishedStudentResultSessionByExamNo(normalized.examNo);
  if (byExamNo && matchesLookup(byExamNo, normalized)) return byExamNo;

  if (!normalized.studentId || !normalized.examSessionId) return null;
  return getCachedPublishedStudentResultSessionByLookup(
    normalized.examNo,
    normalized.studentId,
    normalized.examSessionId,
  );
}
