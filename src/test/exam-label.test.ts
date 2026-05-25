import { describe, expect, it } from "vitest";
import { formatExamOptionLabel } from "@/lib/exam-label";

describe("exam option labels", () => {
  it("shows status and student count", () => {
    expect(formatExamOptionLabel({
      name: "สอบแข่งขันประจำปี",
      status: "DRAFT",
      _count: { students: 64 },
    })).toBe("สอบแข่งขันประจำปี / DRAFT / 64 คน");
  });

  it("defaults missing student count to zero", () => {
    expect(formatExamOptionLabel({
      name: "สอบใหม่",
      status: "DRAFT",
    })).toBe("สอบใหม่ / DRAFT / 0 คน");
  });
});
