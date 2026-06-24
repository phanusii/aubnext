import type {
  CalculatedResult,
  CandidateInput,
  RankingRule,
  SubjectInput,
} from "@/lib/types";

type RankedCandidate = CandidateInput & {
  totalScore: number;
  rank: number;
  tieBreakValues: Record<string, number>;
  tieBreakReason: string | null;
};

function scoreFor(candidate: CandidateInput, subjectId: string) {
  return Number(candidate.scores[subjectId] ?? 0);
}

function compareCandidates(
  a: CandidateInput,
  b: CandidateInput,
  tieBreakSubjectIds: string[],
) {
  const totalDiff = totalScore(b) - totalScore(a);
  if (totalDiff !== 0) return totalDiff;

  for (const subjectId of tieBreakSubjectIds) {
    const diff = scoreFor(b, subjectId) - scoreFor(a, subjectId);
    if (diff !== 0) return diff;
  }

  return a.examNo.localeCompare(b.examNo, "th");
}

function hasSameRankingValue(
  a: CandidateInput,
  b: CandidateInput,
  tieBreakSubjectIds: string[],
) {
  if (totalScore(a) !== totalScore(b)) return false;
  return tieBreakSubjectIds.every((subjectId) => scoreFor(a, subjectId) === scoreFor(b, subjectId));
}

function totalScore(candidate: CandidateInput) {
  return Object.values(candidate.scores).reduce((sum, value) => sum + Number(value || 0), 0);
}

function rankGroup(
  candidates: CandidateInput[],
  tieBreakSubjectIds: string[],
  subjectNameById: Map<string, string>,
): RankedCandidate[] {
  const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, tieBreakSubjectIds));
  let currentRank = 1;

  return sorted.map((candidate, index) => {
    if (index > 0 && !hasSameRankingValue(sorted[index - 1], candidate, tieBreakSubjectIds)) {
      currentRank = index + 1;
    }

    const sameTotalCandidates = sorted.filter(
      (other) => other.studentId !== candidate.studentId && totalScore(other) === totalScore(candidate),
    );
    const decidingSubjectId = sameTotalCandidates
      .flatMap((other) => tieBreakSubjectIds.find((subjectId) => scoreFor(candidate, subjectId) !== scoreFor(other, subjectId)) ?? [])
      .at(0);

    return {
      ...candidate,
      rank: currentRank,
      totalScore: totalScore(candidate),
      tieBreakValues: Object.fromEntries(
        tieBreakSubjectIds.map((subjectId) => [subjectId, scoreFor(candidate, subjectId)]),
      ),
      tieBreakReason: decidingSubjectId
        ? `คะแนนรวมเท่ากัน ใช้วิชา ${subjectNameById.get(decidingSubjectId) ?? decidingSubjectId} ตามลำดับ tie-break`
        : null,
    };
  });
}

function applyQuota(
  ranked: RankedCandidate[],
  quota: number,
  reasonLabel: string,
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL",
): CalculatedResult[] {
  const results: CalculatedResult[] = [];

  for (let index = 0; index < ranked.length; ) {
    const rank = ranked[index].rank;
    const sameRank = ranked.filter((candidate) => candidate.rank === rank);
    const firstPosition = index;
    const lastPositionExclusive = index + sameRank.length;
    const crossesCutoff = firstPosition < quota && lastPositionExclusive > quota;

    let status: CalculatedResult["status"] = "FAILED";
    let reason = `ไม่อยู่ในโควตา${reasonLabel}`;

    if (quota <= 0) {
      status = "FAILED";
      reason = `ไม่มีโควตา${reasonLabel}`;
    } else if (lastPositionExclusive <= quota) {
      status = "PASSED";
      reason = `ผ่านตามโควตา${reasonLabel}`;
    } else if (crossesCutoff) {
      status = "REVIEW";
      reason = `คะแนนเท่ากันตรงเส้นตัด ต้องตรวจสอบโดยกรรมการ`;
    }

    for (const candidate of sameRank) {
      results.push({
        studentId: candidate.studentId,
        examNo: candidate.examNo,
        name: candidate.name,
        rank: candidate.rank,
        rankScope: selectionMode === "WHOLE_LEVEL" ? "WHOLE_LEVEL" : "ROOM",
        selectionMode,
        totalScore: candidate.totalScore,
        status,
        reason: candidate.tieBreakReason ? `${reason} · ${candidate.tieBreakReason}` : reason,
        tieBreakReason: candidate.tieBreakReason,
        room: candidate.room,
        scoreBreakdown: candidate.scores,
        tieBreakValues: candidate.tieBreakValues,
      });
    }

    index = lastPositionExclusive;
  }

  return results;
}

export function calculateResults(
  candidates: CandidateInput[],
  subjects: SubjectInput[],
  rule: RankingRule,
): CalculatedResult[] {
  const subjectNameById = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const tieBreakSubjectIds =
    rule.tieBreakSubjectIds.length > 0
      ? rule.tieBreakSubjectIds
      : subjects
          .filter((subject) => subject.tieBreakOrder != null)
          .sort((a, b) => Number(a.tieBreakOrder) - Number(b.tieBreakOrder))
          .map((subject) => subject.id);

  if (rule.selectionMode === "WHOLE_LEVEL") {
    const ranked = rankGroup(candidates, tieBreakSubjectIds, subjectNameById);
    return applyQuota(ranked, Number(rule.wholeLevelQuota ?? 0), "ทั้งชั้น", "WHOLE_LEVEL");
  }

  const rooms = new Map<string, CandidateInput[]>();
  for (const candidate of candidates) {
    rooms.set(candidate.room, [...(rooms.get(candidate.room) ?? []), candidate]);
  }

  return Array.from(rooms.entries()).flatMap(([room, roomCandidates]) => {
    const ranked = rankGroup(roomCandidates, tieBreakSubjectIds, subjectNameById);
    const quota = Number(rule.roomQuotas?.[room] ?? 0);
    return applyQuota(ranked, quota, `ห้อง ${room}`, "PER_ROOM");
  });
}
