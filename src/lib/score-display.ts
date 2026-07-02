// โหมดแสดงคะแนนที่ประกาศ: คะแนนจริง หรือ ร้อยละ (เต็ม 100)
export type ScoreDisplayMode = "RAW" | "PERCENT";

export function isPercentMode(mode?: string | null): boolean {
  return mode === "PERCENT";
}

// ปัดเศษ: จำนวนเต็ม → แสดงเต็ม, ทศนิยม → 2 ตำแหน่ง
export function formatScoreNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

// ร้อยละของคะแนน = score / maxScore * 100 (คืน null ถ้าไม่มีคะแนนเต็ม)
export function percentValue(score: number, maxScore?: number | null): number | null {
  if (!maxScore || maxScore <= 0 || !Number.isFinite(score)) return null;
  return (score / maxScore) * 100;
}

// สตริงคะแนนตามโหมด — PERCENT: "90%" (ถ้ามี max) · RAW: "45" (ส่วน "/เต็ม" ให้ผู้เรียกจัดการเอง)
export function displayScore(score: number, maxScore: number | null | undefined, mode: ScoreDisplayMode | string | null | undefined): string {
  if (isPercentMode(mode)) {
    const pct = percentValue(score, maxScore);
    if (pct !== null) return `${formatScoreNumber(pct)}%`;
  }
  return formatScoreNumber(score);
}
