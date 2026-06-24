import { describe, expect, it } from "vitest";
import { pointsToNextBand, scoreBand, subjectBandAdvice, totalBandAdvice } from "@/lib/score-bands";

describe("scoreBand — 10 ช่วง decile (%)", () => {
  it("แบ่ง index ตามเปอร์เซ็นต์ของคะแนนเต็ม", () => {
    expect(scoreBand(0, 100)?.index).toBe(0);
    expect(scoreBand(9.9, 100)?.index).toBe(0);
    expect(scoreBand(10, 100)?.index).toBe(1);
    expect(scoreBand(55, 100)?.index).toBe(5);
    expect(scoreBand(89, 100)?.index).toBe(8);
    expect(scoreBand(90, 100)?.index).toBe(9);
    expect(scoreBand(100, 100)?.index).toBe(9); // เต็ม 100% → ช่วงสูงสุด (ไม่หลุดเป็น index 10)
  });

  it("คิด % จากคะแนนเต็มที่ไม่ใช่ 100", () => {
    expect(scoreBand(40, 50)?.index).toBe(8); // 80%
    expect(scoreBand(25, 50)?.pct).toBeCloseTo(50);
  });

  it("rangeLabel ของช่วงสูงสุดคือ 90–100%", () => {
    expect(scoreBand(95, 100)?.rangeLabel).toBe("90–100%");
    expect(scoreBand(10, 100)?.rangeLabel).toBe("10–19%");
  });

  it("คืน null เมื่อไม่มีคะแนนเต็ม (คิด % ไม่ได้)", () => {
    expect(scoreBand(50, 0)).toBeNull();
    expect(scoreBand(50, null)).toBeNull();
    expect(scoreBand(50, undefined)).toBeNull();
  });
});

describe("pointsToNextBand — คะแนนถึงช่วงถัดไป", () => {
  it("คืนคะแนนที่ต้องเพิ่มและชื่อช่วงถัดไป", () => {
    const next = pointsToNextBand(55, 100); // อยู่ช่วง 50–59 → ถัดไป 60
    expect(next?.points).toBeCloseTo(5);
    expect(next?.nextLabel).toBe("พอใช้ถึงดี");
  });

  it("คิดตามคะแนนเต็มจริง", () => {
    const next = pointsToNextBand(20, 50); // 40% ช่วง index 4 → ถัดไป 50% = 25 คะแนน
    expect(next?.points).toBeCloseTo(5);
  });

  it("คืน null เมื่ออยู่ช่วงสูงสุดแล้ว", () => {
    expect(pointsToNextBand(95, 100)).toBeNull();
  });
});

describe("คลังคำแนะนำ", () => {
  it("totalBandAdvice คืนข้อความไม่ว่างทุกช่วง และคงที่ตาม seed", () => {
    for (let score = 0; score <= 100; score += 10) {
      const band = scoreBand(score, 100)!;
      const text = totalBandAdvice(band, 7);
      expect(text.length).toBeGreaterThan(0);
      expect(totalBandAdvice(band, 7)).toBe(text); // seed เดิม → ข้อความเดิม
    }
  });

  it("subjectBandAdvice แทนค่า {subject}/{gap}/{nextLabel}", () => {
    const band = scoreBand(72, 100)!; // ช่วง "ดี" index 7
    const text = subjectBandAdvice(band, "คณิตศาสตร์", 8, "ดีมาก", 3);
    expect(text).toContain("คณิตศาสตร์");
    expect(text).not.toContain("{subject}");
    expect(text).not.toContain("{gap}");
    expect(text).not.toContain("{nextLabel}");
  });
});
