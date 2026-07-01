import { describe, expect, it } from "vitest";
import { scaleScoreToMaxScore } from "@/lib/repository";

describe("subject max score adjustment", () => {
  it("scales scores to the new max score with two decimal precision", () => {
    expect(scaleScoreToMaxScore(24, 30, 50)).toBe(40);
    expect(scaleScoreToMaxScore(17, 30, 50)).toBe(28.33);
  });

  it("rejects invalid max score values when scaling", () => {
    expect(() => scaleScoreToMaxScore(10, 0, 50)).toThrow("ข้อมูลคะแนนเต็มไม่ถูกต้อง");
    expect(() => scaleScoreToMaxScore(10, 30, 0)).toThrow("ข้อมูลคะแนนเต็มไม่ถูกต้อง");
  });
});
