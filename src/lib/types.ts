export type SelectionMode = "PER_ROOM" | "WHOLE_LEVEL";
export type ResultStatus = "PASSED" | "FAILED" | "REVIEW";

export type SubjectInput = {
  id: string;
  name: string;
  sortOrder: number;
  tieBreakOrder?: number | null;
};

export type CandidateInput = {
  studentId: string;
  examNo: string;
  name: string;
  classLevel: string;
  room: string;
  scores: Record<string, number>;
};

export type RankingRule = {
  selectionMode: SelectionMode;
  wholeLevelQuota?: number | null;
  roomQuotas?: Record<string, number>;
  tieBreakSubjectIds: string[];
};

export type CalculatedResult = {
  studentId: string;
  rank: number;
  totalScore: number;
  status: ResultStatus;
  reason: string;
  room: string;
  scoreBreakdown: Record<string, number>;
  tieBreakValues: Record<string, number>;
};
