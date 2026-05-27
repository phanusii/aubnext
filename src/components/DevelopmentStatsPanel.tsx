"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, GraduationCap, LineChart, Medal, Target, TrendingUp } from "lucide-react";
import type { PublicStudentResult } from "@/lib/repository";

type SubjectStats = PublicStudentResult["statistics"]["subjects"][number];
type InsightLevel = "strength" | "above" | "near" | "improve";
type DevelopmentTier = "single" | "top" | "lead" | "strong" | "good" | "steady" | "focus" | "foundation";

type SubjectInsight = SubjectStats & {
  deltaRoom: number;
  deltaLevel: number;
  level: InsightLevel;
  label: string;
  groupLabel: string;
  advice: string;
};

const insightStyles: Record<InsightLevel, { badge: string; bar: string; text: string }> = {
  strength: {
    badge: "bg-sky-50 text-sky-700 ring-sky-100",
    bar: "bg-sky-500",
    text: "text-sky-700",
  },
  above: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  near: {
    badge: "bg-amber-50 text-amber-700 ring-amber-100",
    bar: "bg-amber-400",
    text: "text-amber-700",
  },
  improve: {
    badge: "bg-pink-50 text-pink-700 ring-pink-100",
    bar: "bg-pink-500",
    text: "text-pink-700",
  },
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatScore(value: number) {
  if (!Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rankText(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 0 || rank <= 0) return "ยังไม่มีข้อมูลกลุ่ม";
  if (count === 1) return "มีข้อมูล 1 คน";
  return `อันดับ ${rank} จาก ${count} คน`;
}

function deltaText(value: number) {
  if (!Number.isFinite(value)) return "-";
  const score = formatScore(Math.abs(value));
  if (Math.abs(value) < 0.005) return "เท่าค่าเฉลี่ย";
  return value > 0 ? `สูงกว่าเฉลี่ย ${score} คะแนน` : `ต่ำกว่าเฉลี่ย ${score} คะแนน`;
}

function nextGoalText(deltaLevel: number) {
  if (!Number.isFinite(deltaLevel)) return "ใช้รายวิชาด้านล่างเลือกจุดฝึกต่อที่เหมาะกับตนเอง";
  if (deltaLevel >= 5) return "รักษาระดับนี้ไว้ และฝึกโจทย์ยากขึ้นเพื่อเพิ่มความมั่นใจ";
  if (deltaLevel >= 0) return "รักษาความสม่ำเสมอ แล้วทบทวนข้อผิดพลาดเพื่อขยับอันดับให้ดีขึ้น";
  return `เพิ่มอีก ${formatScore(Math.abs(deltaLevel))} คะแนนเพื่อถึงค่าเฉลี่ยทั้งชั้น`;
}

function rankRatio(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return null;
  return rank / count;
}

function developmentTier(deltaLevel: number, rank: number, count: number): DevelopmentTier {
  const ratio = rankRatio(rank, count);
  if (ratio === null) return "single";
  if (rank === 1) return "top";
  if (ratio <= 0.15) return "lead";
  if (ratio <= 0.25) return "strong";
  if (ratio <= 0.5 || deltaLevel >= 3) return "good";
  if (ratio <= 0.75 || deltaLevel >= -3) return "steady";
  if (ratio <= 0.9 || deltaLevel >= -8) return "focus";
  return "foundation";
}

function textSeed(...values: Array<number | string>) {
  return values.reduce<number>((total, value) => {
    if (typeof value === "number") return total + Math.round(value * 10);
    return total + [...value].reduce((innerTotal, char) => innerTotal + char.charCodeAt(0), 0);
  }, 0);
}

function pickText(options: string[], seed: number) {
  return options[Math.abs(seed) % options.length] ?? options[0] ?? "";
}

function rankBand(rank: number, count: number): InsightLevel {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return "near";
  if (rank <= Math.max(1, Math.ceil(count / 4))) return "strength";
  if (rank <= Math.max(1, Math.ceil(count / 2))) return "above";
  if (rank <= Math.max(1, Math.ceil((count * 3) / 4))) return "near";
  return "improve";
}

function groupLabel(level: InsightLevel) {
  if (level === "strength") return "กลุ่มนำ";
  if (level === "above") return "กลุ่มดี";
  if (level === "near") return "ใกล้ค่าเฉลี่ย";
  return "ควรเสริม";
}

function comparisonGroupText(level: InsightLevel, rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 0 || rank <= 0) return "ยังไม่มีข้อมูลกลุ่ม";
  if (count === 1) return "มีข้อมูล 1 คน";
  return groupLabel(level);
}

function rankContextText(level: InsightLevel, rank: number, count: number, context: "ห้อง" | "ทั้งชั้น") {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return "ยังเปรียบเทียบกลุ่มไม่ได้";
  if (level === "strength") return `อยู่กลุ่มนำของ${context}`;
  if (level === "above") return `อยู่กลุ่มดีของ${context}`;
  if (level === "near") return `อยู่ช่วงกลางของ${context}`;
  return `ยังมีพื้นที่ให้ขยับอันดับใน${context}`;
}

function subjectLabel(level: InsightLevel) {
  if (level === "strength") return "จุดแข็ง";
  if (level === "above") return "ทำได้ดี";
  if (level === "near") return "ใกล้เป้าหมาย";
  return "ควรเสริมก่อน";
}

function classifySubject(deltaLevel: number, levelRank: number, levelCount: number): InsightLevel {
  const band = rankBand(levelRank, levelCount);
  if (deltaLevel >= 0 && band === "strength") return "strength";
  if (deltaLevel >= 0) return "above";
  if (deltaLevel >= -3) return "near";
  return "improve";
}

const totalMessageByTier: Record<DevelopmentTier, string[]> = {
  single: [
    "มีข้อมูลเปรียบเทียบกลุ่มน้อย ให้ใช้คะแนนรายวิชาและข้อผิดพลาดเป็นเข็มทิศพัฒนาต่อ",
    "ยังเปรียบเทียบอันดับกับกลุ่มไม่ได้ชัดเจน โฟกัสที่การรักษาวิชาที่ถนัดและเสริมวิชาที่คะแนนต่ำกว่าเฉลี่ย",
  ],
  top: [
    "ภาพรวมอยู่หัวแถวของกลุ่ม รักษาวินัยเดิมและเพิ่มโจทย์ท้าทายเพื่อยกระดับความแม่นยำ",
    "ทำได้โดดเด่นมาก ควรต่อยอดด้วยโจทย์ยากและทบทวนข้อผิดพลาดเล็ก ๆ เพื่อรักษาอันดับ",
    "ผลรวมแข็งแรงมาก เป้าหมายถัดไปคือรักษาความสม่ำเสมอและลดคะแนนที่เสียจากความรีบหรือความประมาท",
  ],
  lead: [
    "ภาพรวมอยู่กลุ่มนำ ใช้วิชาที่เด่นเป็นฐาน แล้วเลือกเสริมวิชาที่ต่างจากเฉลี่ยน้อยที่สุดก่อน",
    "อยู่ในระดับที่ดีมาก การขยับขึ้นต่อจะมาจากการเก็บรายละเอียดและฝึกโจทย์แบบจับเวลา",
    "คะแนนรวมมีทิศทางดี ให้รักษาจังหวะอ่านหนังสือและเพิ่มรอบทบทวนบทที่ยังพลาดซ้ำ",
  ],
  strong: [
    "ภาพรวมแข็งแรงกว่ากลุ่มส่วนใหญ่ ต่อยอดด้วยการสรุปจุดผิดและฝึกโจทย์ระดับกลางถึงยาก",
    "อยู่ในกลุ่มดีมาก ถ้าต้องการขยับอันดับ ให้เริ่มจากวิชาที่คะแนนห่างจากค่าเฉลี่ยน้อยที่สุด",
    "พื้นฐานโดยรวมดีแล้ว ควรเพิ่มความเร็วในการทำข้อสอบและตรวจคำตอบให้เป็นระบบ",
  ],
  good: [
    "ภาพรวมทำได้ดี มีโอกาสขยับขึ้นอีกจากการแก้จุดพลาดรายวิชาอย่างสม่ำเสมอ",
    "อยู่ในระดับดี ให้เลือกวิชาที่ควรเสริมก่อนเป็นงานหลัก แล้วรักษาวิชาที่ทำได้ดีไว้",
    "คะแนนรวมอยู่ในทิศทางบวก เป้าหมายคือเพิ่มความแน่นของพื้นฐานและลดข้อผิดพลาดซ้ำ",
  ],
  steady: [
    "ภาพรวมอยู่ช่วงกลางของกลุ่ม การฝึกต่อเนื่องทีละวิชาจะช่วยให้ขยับอันดับได้ชัดขึ้น",
    "คะแนนใกล้กลุ่มหลักแล้ว ให้เริ่มจากบทพื้นฐานที่ผิดบ่อยและทำแบบฝึกหัดสั้น ๆ ทุกวัน",
    "มีฐานให้ต่อยอดได้ เลือกหนึ่งวิชาที่ควรเสริมก่อน แล้ววัดผลจากคะแนนแบบฝึกหัดรายสัปดาห์",
  ],
  focus: [
    "ภาพรวมยังมีพื้นที่ให้ขยับขึ้น เริ่มจากวิชาที่แนะนำก่อนและตั้งเป้าเพิ่มคะแนนทีละช่วงสั้น ๆ",
    "ควรโฟกัสพื้นฐานและโจทย์ที่ออกบ่อยก่อน เมื่อความแม่นขึ้นแล้วค่อยเพิ่มโจทย์จับเวลา",
    "ยังพัฒนาได้อีกมาก ให้ขอครูช่วยชี้จุดผิดซ้ำ แล้วฝึกแก้ทีละเรื่องจนมั่นใจก่อนข้ามบท",
  ],
  foundation: [
    "ภาพรวมควรเริ่มจากการปูพื้นฐานใหม่ เลือกหัวข้อที่เสียคะแนนมากที่สุดและฝึกทีละชุดเล็ก ๆ",
    "ช่วงนี้ควรเน้นความเข้าใจพื้นฐานมากกว่าความเร็ว ทำโจทย์ง่ายถึงกลางให้แม่นก่อน",
    "ให้เริ่มจากบทหลักที่ยังไม่มั่นใจ ขอคำแนะนำจากครู และทบทวนซ้ำเป็นรอบสั้น ๆ อย่างต่อเนื่อง",
  ],
};

const subjectAdviceByTier: Record<DevelopmentTier, string[]> = {
  single: [
    "ใช้คะแนนวิชานี้เป็นข้อมูลตั้งต้น แล้วดูข้อที่ผิดซ้ำเพื่อวางแผนฝึกต่อ",
    "ยังเทียบกลุ่มไม่ได้ชัดเจน ให้เน้นทบทวนบทที่ไม่มั่นใจและทำโจทย์พื้นฐานให้ครบ",
  ],
  top: [
    `รักษาจุดแข็งใน{subject} และลองฝึกโจทย์ระดับยากขึ้น`,
    `{subject}เป็นจุดเด่นมาก ควรฝึกโจทย์ประยุกต์และจับเวลาเพื่อรักษาความเฉียบ`,
    `ต่อยอด{subject}ด้วยการอธิบายวิธีทำให้เพื่อนหรือสรุปสูตร/หลักคิดเป็นของตัวเอง`,
  ],
  lead: [
    `{subject}อยู่ในกลุ่มนำ ให้รักษาความสม่ำเสมอและเก็บรายละเอียดข้อที่ยังพลาด`,
    `เพิ่มความมั่นใจใน{subject}ด้วยโจทย์ชุดยากขึ้นและทบทวนคำตอบที่ผิดทุกครั้ง`,
    `ใช้{subject}เป็นวิชาทำคะแนนหลัก แล้วฝึกโจทย์จับเวลาเพื่อเพิ่มความนิ่งในห้องสอบ`,
  ],
  strong: [
    `{subject}ทำได้แข็งแรง ควรทบทวนข้อผิดพลาดเดิมและเพิ่มโจทย์ระดับกลางถึงยาก`,
    `ต่อยอด{subject}ด้วยการจับเวลาทำโจทย์และสรุปจุดที่เสียคะแนนบ่อย`,
    `รักษาระดับ{subject}ไว้ แล้วเพิ่มความแม่นในบทที่ยังไม่เต็มคะแนน`,
  ],
  good: [
    `{subject}อยู่ในทิศทางดี ให้ฝึกโจทย์สม่ำเสมอและทบทวนบทที่พลาดซ้ำ`,
    `ขยับ{subject}ได้อีกด้วยการทำแบบฝึกหัดเป็นชุดสั้น ๆ แล้วตรวจเหตุผลทุกข้อ`,
    `ต่อยอด{subject}ด้วยการแยกบทที่ถนัดและไม่ถนัด แล้วฝึกบทที่ยังไม่แน่นก่อน`,
  ],
  steady: [
    `{subject}ใกล้เป้าหมายแล้ว เพิ่มอีกประมาณ {gap} คะแนนจะเข้าใกล้ค่าเฉลี่ยทั้งชั้นมากขึ้น`,
    `เสริม{subject}ด้วยโจทย์พื้นฐานถึงกลาง และจดข้อผิดซ้ำไว้ทบทวนก่อนสอบ`,
    `เริ่มพัฒนา{subject}จากบทที่ออกบ่อย ทำโจทย์วันละชุดเล็ก ๆ เพื่อเพิ่มความคุ้นมือ`,
  ],
  focus: [
    `เริ่มเสริม{subject}จากพื้นฐานที่ผิดซ้ำ ขอครูช่วยดูจุดผิด แล้วฝึกโจทย์ทีละชุด`,
    `{subject}ควรฝึกก่อน โดยเริ่มจากบทพื้นฐานและโจทย์ที่มีเฉลยละเอียด`,
    `วางแผน{subject}เป็นรอบสั้น ๆ: ทบทวน 1 บท ทำโจทย์ 1 ชุด แล้วจดข้อที่ยังไม่เข้าใจ`,
  ],
  foundation: [
    `{subject}ควรปูพื้นฐานใหม่ทีละบท เริ่มจากเรื่องที่ครูเน้นและโจทย์ง่ายก่อน`,
    `ให้ขอครูช่วยดูพื้นฐานของ{subject} แล้วฝึกโจทย์สั้น ๆ ซ้ำจนทำได้ด้วยตนเอง`,
    `อย่าเพิ่งรีบทำโจทย์ยากใน{subject} ให้กลับไปทบทวนหลักสำคัญและตัวอย่างพื้นฐานก่อน`,
  ],
};

function fillSubjectAdvice(template: string, subjectName: string, deltaLevel: number) {
  return template
    .replaceAll("{subject}", subjectName)
    .replaceAll("{gap}", formatScore(Math.abs(deltaLevel)));
}

function subjectAdvice(subjectName: string, deltaLevel: number, levelRank: number, levelCount: number, score: number) {
  const tier = developmentTier(deltaLevel, levelRank, levelCount);
  const template = pickText(subjectAdviceByTier[tier], textSeed(subjectName, deltaLevel, levelRank, levelCount, score));
  return fillSubjectAdvice(template, subjectName, deltaLevel);
}

function totalMessage(deltaLevel: number, levelRank: number, levelCount: number) {
  const tier = developmentTier(deltaLevel, levelRank, levelCount);
  return pickText(totalMessageByTier[tier], textSeed(deltaLevel, levelRank, levelCount));
}

function barWidth(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return 100;
  return Math.max(6, Math.min(100, ((count - rank + 1) / count) * 100));
}

function scoreBarWidth(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function buildSubjectInsights(subjects: SubjectStats[]) {
  return subjects.map((subject) => {
    const deltaRoom = subject.score - subject.roomAverage;
    const deltaLevel = subject.score - subject.levelAverage;
    const level = classifySubject(deltaLevel, subject.levelRank, subject.levelCount);
    return {
      ...subject,
      deltaRoom,
      deltaLevel,
      level,
      label: subjectLabel(level),
      groupLabel: groupLabel(level),
      advice: subjectAdvice(subject.name, deltaLevel, subject.levelRank, subject.levelCount, subject.score),
    };
  });
}

export function DevelopmentStatsPanel({ result }: { result: PublicStudentResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const { total, subjects } = result.statistics;
  const totalDeltaRoom = total.score - total.roomAverage;
  const totalDeltaLevel = total.score - total.levelAverage;
  const totalLevel = rankBand(total.levelRank, total.levelCount);
  const subjectInsights = useMemo(() => buildSubjectInsights(subjects), [subjects]);
  const strongestSubject = subjectInsights.length
    ? [...subjectInsights].sort((a, b) => b.deltaLevel - a.deltaLevel)[0]
    : null;
  const focusSubject = subjectInsights.length
    ? [...subjectInsights].sort((a, b) => a.deltaLevel - b.deltaLevel)[0]
    : null;
  const panelId = "development-stats-panel";

  return (
    <section className="mt-7 border-t border-sky-100 pt-5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#fff7fb)] px-4 py-4 text-left shadow-[0_10px_28px_rgba(14,165,233,0.08)] transition hover:border-sky-200 hover:shadow-[0_14px_34px_rgba(14,165,233,0.12)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-sky-700 ring-1 ring-sky-100">
            <GraduationCap size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-tight text-slate-950">
              {isOpen ? "ซ่อนสถิติเพื่อการพัฒนา" : "ดูสถิติเพื่อการพัฒนา"}
            </span>
            <span className="mt-1 block text-sm leading-5 text-[var(--text-muted)]">
              อ่านจุดแข็ง วิชาที่ควรเริ่มก่อน และเป้าหมายถัดไปแบบเข้าใจง่าย
            </span>
          </span>
        </span>
        <span className="shrink-0 text-sky-700">
          {isOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="mt-4 space-y-4">
          <OverviewSection
            score={total.score}
            roomAverage={total.roomAverage}
            levelAverage={total.levelAverage}
            deltaRoom={totalDeltaRoom}
            deltaLevel={totalDeltaLevel}
            roomRank={total.roomRank}
            roomCount={total.roomCount}
            levelRank={total.levelRank}
            levelCount={total.levelCount}
            totalLevel={totalLevel}
          />

          <ComparisonAndRankSection
            score={total.score}
            roomAverage={total.roomAverage}
            levelAverage={total.levelAverage}
            roomRank={total.roomRank}
            roomCount={total.roomCount}
            levelRank={total.levelRank}
            levelCount={total.levelCount}
          />

          <DevelopmentFocusSection
            message={totalMessage(totalDeltaLevel, total.levelRank, total.levelCount)}
            goal={nextGoalText(totalDeltaLevel)}
            strongestSubject={strongestSubject}
            focusSubject={focusSubject}
          />

          <SubjectDevelopmentTable subjects={subjectInsights} />
        </div>
      )}
    </section>
  );
}

function OverviewSection({
  score,
  roomAverage,
  levelAverage,
  deltaRoom,
  deltaLevel,
  roomRank,
  roomCount,
  levelRank,
  levelCount,
  totalLevel,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  deltaRoom: number;
  deltaLevel: number;
  roomRank: number;
  roomCount: number;
  levelRank: number;
  levelCount: number;
  totalLevel: InsightLevel;
}) {
  return (
    <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_30px_rgba(14,165,233,0.07)]">
      <div className="mb-4 flex items-center gap-2">
        <Target size={18} className="text-sky-700" />
        <h3 className="text-lg font-semibold leading-tight text-slate-950">ภาพรวมเพื่อการพัฒนา</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InsightCard label="คะแนนรวม" value={formatScore(score)} subValue={nextGoalText(deltaLevel)} tone="sky" />
        <InsightCard
          label="กลุ่มระดับ"
          value={comparisonGroupText(totalLevel, levelRank, levelCount)}
          subValue="ดูจากอันดับและค่าเฉลี่ยทั้งชั้น"
          tone={totalLevel === "improve" ? "amber" : "emerald"}
        />
        <InsightCard
          label="อันดับในห้อง"
          value={rankText(roomRank, roomCount)}
          subValue={rankContextText(rankBand(roomRank, roomCount), roomRank, roomCount, "ห้อง")}
          tone="pink"
        />
        <InsightCard
          label="อันดับทั้งชั้น"
          value={rankText(levelRank, levelCount)}
          subValue={rankContextText(totalLevel, levelRank, levelCount, "ทั้งชั้น")}
          tone="sky"
        />
        <InsightCard
          label="เทียบเฉลี่ยห้อง"
          value={deltaText(deltaRoom)}
          subValue={`เฉลี่ยห้อง ${formatScore(roomAverage)}`}
          tone={deltaRoom >= 0 ? "emerald" : "amber"}
        />
        <InsightCard
          label="เทียบเฉลี่ยชั้น"
          value={deltaText(deltaLevel)}
          subValue={`เฉลี่ยชั้น ${formatScore(levelAverage)}`}
          tone={deltaLevel >= 0 ? "emerald" : "amber"}
        />
      </div>
      <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
        {totalMessage(deltaLevel, levelRank, levelCount)}
      </p>
    </div>
  );
}

function InsightCard({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  tone: "sky" | "pink" | "emerald" | "amber";
}) {
  const toneClass = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    pink: "bg-pink-50 text-pink-700 ring-pink-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  }[tone];

  return (
    <div className="min-h-28 rounded-2xl border border-sky-100 bg-[#fbfdff] p-3.5">
      <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
      <p className={cx("mt-2 inline-flex rounded-full px-2.5 py-1 text-base font-semibold ring-1", toneClass)}>{value}</p>
      {subValue && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{subValue}</p>}
    </div>
  );
}

function ComparisonAndRankSection({
  score,
  roomAverage,
  levelAverage,
  roomRank,
  roomCount,
  levelRank,
  levelCount,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  roomRank: number;
  roomCount: number;
  levelRank: number;
  levelCount: number;
}) {
  const maxScore = Math.max(score, roomAverage, levelAverage, 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-sky-700" />
          <h3 className="text-base font-semibold text-slate-950">คะแนนเทียบค่าเฉลี่ย</h3>
        </div>
        <div className="space-y-3">
          <ComparisonBar label="นักเรียน" value={score} max={maxScore} barClass="bg-sky-500" textClass="text-sky-700" />
          <ComparisonBar label="เฉลี่ยห้อง" value={roomAverage} max={maxScore} barClass="bg-pink-400" textClass="text-pink-700" />
          <ComparisonBar label="เฉลี่ยทั้งชั้น" value={levelAverage} max={maxScore} barClass="bg-slate-300" textClass="text-slate-700" />
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <LineChart size={18} className="text-pink-600" />
          <h3 className="text-base font-semibold text-slate-950">ตำแหน่งในกลุ่ม</h3>
        </div>
        <div className="space-y-4">
          <DevelopmentRankBar label="ในห้อง" rank={roomRank} count={roomCount} />
          <DevelopmentRankBar label="ทั้งชั้น" rank={levelRank} count={levelCount} />
        </div>
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  barClass,
  textClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  textClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={cx("font-semibold", textClass)}>{formatScore(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full", barClass)} style={{ width: `${scoreBarWidth(value, max)}%` }} />
      </div>
    </div>
  );
}

function DevelopmentRankBar({ label, rank, count }: { label: string; rank: number; count: number }) {
  const level = rankBand(rank, count);
  const context = label === "ในห้อง" ? "ห้อง" : "ทั้งชั้น";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">อันดับ{label}</span>
        <span className="font-semibold text-slate-950">{rankText(rank, count)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#f9a8d4)]" style={{ width: `${barWidth(rank, count)}%` }} />
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {rankContextText(level, rank, count, context)}
      </p>
    </div>
  );
}

function DevelopmentFocusSection({
  message,
  goal,
  strongestSubject,
  focusSubject,
}: {
  message: string;
  goal: string;
  strongestSubject: SubjectInsight | null;
  focusSubject: SubjectInsight | null;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <FocusCard
        icon={<TrendingUp size={18} />}
        title="เป้าหมายถัดไป"
        value="ฝึกต่ออย่างมีทิศทาง"
        description={`${message} ${goal}`}
        tone="sky"
      />
      <FocusCard
        icon={<Medal size={18} />}
        title="รักษาจุดแข็ง"
        value={strongestSubject?.name ?? "-"}
        description={strongestSubject ? strongestSubject.advice : "ยังไม่มีข้อมูลรายวิชาสำหรับวิเคราะห์จุดแข็ง"}
        tone="emerald"
      />
      <FocusCard
        icon={<Target size={18} />}
        title="เริ่มพัฒนาที่วิชา"
        value={focusSubject?.name ?? "-"}
        description={focusSubject ? focusSubject.advice : "ยังไม่มีข้อมูลรายวิชาสำหรับวิเคราะห์จุดที่ควรเสริม"}
        tone="pink"
      />
    </div>
  );
}

function FocusCard({
  icon,
  title,
  value,
  description,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
  tone: "sky" | "emerald" | "pink";
}) {
  const iconClass = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    pink: "bg-pink-50 text-pink-700 ring-pink-100",
  }[tone];

  return (
    <article className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2">
        <span className={cx("grid size-9 place-items-center rounded-xl ring-1", iconClass)}>{icon}</span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <p className="mt-3 text-xl font-semibold leading-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </article>
  );
}

function SubjectDevelopmentTable({ subjects }: { subjects: SubjectInsight[] }) {
  if (subjects.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-sky-100 bg-white p-5 text-sm text-[var(--text-muted)]">
        ยังไม่มีข้อมูลรายวิชาสำหรับแสดงสถิติเพื่อการพัฒนา
      </div>
    );
  }

  return (
    <section className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_30px_rgba(14,165,233,0.07)]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold leading-tight text-slate-950">ตารางพัฒนารายวิชา</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
          ดูคะแนน อันดับ และส่วนต่างจากค่าเฉลี่ย เพื่อเลือกวิชาที่ควรฝึกก่อน
        </p>
      </div>

      <div className="grid gap-3">
        {subjects.map((subject) => {
          const style = insightStyles[subject.level];
          return (
            <article key={subject.id} className="rounded-[1.25rem] border border-sky-100 bg-[#fbfdff] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-base font-semibold text-slate-950">{subject.name}</h4>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">คะแนน {formatScore(subject.score)}</p>
                </div>
                <span className={cx("w-fit rounded-full px-3 py-1.5 text-xs font-semibold ring-1", style.badge)}>
                  {subject.label}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <SubjectMetric label="กลุ่มระดับ" value={comparisonGroupText(subject.level, subject.levelRank, subject.levelCount)} />
                <SubjectMetric label="เทียบเฉลี่ยห้อง" value={deltaText(subject.deltaRoom)} />
                <SubjectMetric label="เทียบเฉลี่ยชั้น" value={deltaText(subject.deltaLevel)} />
                <SubjectMetric label="อันดับห้อง" value={rankText(subject.roomRank, subject.roomCount)} />
                <SubjectMetric label="อันดับทั้งชั้น" value={rankText(subject.levelRank, subject.levelCount)} />
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">ตำแหน่งในทั้งชั้น</span>
                  <span className={cx("font-semibold", style.text)}>
                    {comparisonGroupText(subject.level, subject.levelRank, subject.levelCount)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={cx("h-full rounded-full", style.bar)} style={{ width: `${barWidth(subject.levelRank, subject.levelCount)}%` }} />
                </div>
              </div>

              <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-[var(--text-muted)] ring-1 ring-sky-50">
                {rankContextText(subject.level, subject.levelRank, subject.levelCount, "ทั้งชั้น")} · {subject.advice}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SubjectMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-sky-50">
      <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-950">{value}</p>
    </div>
  );
}
