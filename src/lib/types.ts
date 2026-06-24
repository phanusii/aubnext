export type SelectionMode = "PER_ROOM" | "WHOLE_LEVEL";
export type ResultStatus = "PASSED" | "FAILED" | "REVIEW" | "ABSENT";

export type SubjectInput = {
  id: string;
  name: string;
  sortOrder: number;
  maxScore?: number | null;
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
  examNo: string;
  name: string;
  rank: number;
  rankScope: "WHOLE_LEVEL" | "ROOM";
  selectionMode: SelectionMode;
  totalScore: number;
  status: ResultStatus;
  reason: string;
  tieBreakReason?: string | null;
  room: string;
  scoreBreakdown: Record<string, number>;
  tieBreakValues: Record<string, number>;
};
