import { describe, expect, it } from "vitest";
import { calculateResults } from "@/lib/ranking";

const subjects = [
  { id: "math", name: "คณิตศาสตร์", sortOrder: 0, tieBreakOrder: 1 },
  { id: "science", name: "วิทยาศาสตร์", sortOrder: 1, tieBreakOrder: 2 },
  { id: "thai", name: "ภาษาไทย", sortOrder: 2 },
];

const baseCandidates = [
  {
    studentId: "s1",
    examNo: "P001",
    name: "หนึ่ง",
    classLevel: "ม.1",
    room: "1",
    scores: { math: 80, science: 70, thai: 70 },
  },
  {
    studentId: "s2",
    examNo: "P002",
    name: "สอง",
    classLevel: "ม.1",
    room: "1",
    scores: { math: 85, science: 65, thai: 70 },
  },
  {
    studentId: "s3",
    examNo: "P003",
    name: "สาม",
    classLevel: "ม.1",
    room: "2",
    scores: { math: 75, science: 80, thai: 60 },
  },
  {
    studentId: "s4",
    examNo: "P004",
    name: "สี่",
    classLevel: "ม.1",
    room: "2",
    scores: { math: 75, science: 80, thai: 60 },
  },
];

describe("calculateResults", () => {
  it("uses tie-break subjects after total score", () => {
    const results = calculateResults(baseCandidates.slice(0, 2), subjects, {
      selectionMode: "WHOLE_LEVEL",
      wholeLevelQuota: 1,
      tieBreakSubjectIds: ["math", "science"],
    });

    expect(results.find((result) => result.studentId === "s2")?.status).toBe("PASSED");
    expect(results.find((result) => result.studentId === "s1")?.status).toBe("FAILED");
    expect(results.find((result) => result.studentId === "s2")?.tieBreakReason).toContain("คณิตศาสตร์");
    expect(results.find((result) => result.studentId === "s2")?.tieBreakReason).toContain("ลำดับตัดสินที่ 1");
  });

  it("marks a tied boundary as review", () => {
    const results = calculateResults(baseCandidates.slice(2), subjects, {
      selectionMode: "PER_ROOM",
      roomQuotas: { "2": 1 },
      tieBreakSubjectIds: ["math", "science"],
    });

    expect(results.map((result) => result.status)).toEqual(["REVIEW", "REVIEW"]);
  });

  it("applies unequal room quotas independently", () => {
    const results = calculateResults(baseCandidates, subjects, {
      selectionMode: "PER_ROOM",
      roomQuotas: { "1": 2, "2": 0 },
      tieBreakSubjectIds: ["math"],
    });

    expect(results.filter((result) => result.room === "1").every((result) => result.status === "PASSED")).toBe(
      true,
    );
    expect(results.filter((result) => result.room === "2").every((result) => result.status === "FAILED")).toBe(
      true,
    );
  });
});
