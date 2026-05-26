import { unstable_cache } from "next/cache";
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

const getCachedPublishedStudentResultSessionByExamNo = unstable_cache(
  async (examNo: string) => findPublishedStudentResultSession({ examNo }),
  ["public-student-result-session"],
  {
    tags: [publicStudentResultCacheTag, publicSettingsCacheTag],
    revalidate: 300,
  },
);

const getCachedPublishedStudentResultSessionByLookup = unstable_cache(
  async (examNo: string, studentId: string, examSessionId: string) =>
    findPublishedStudentResultSession({
      examNo,
      studentId: studentId || undefined,
      examSessionId: examSessionId || undefined,
    }),
  ["public-student-result-session-lookup"],
  {
    tags: [publicStudentResultCacheTag, publicSettingsCacheTag],
    revalidate: 300,
  },
);

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
