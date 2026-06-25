"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GraduationCap, Medal, Target, TrendingUp } from "lucide-react";
import type { PublicStudentResult } from "@/lib/repository";
import {
  pointsToNextBand,
  scoreBand,
  subjectBandAdvice,
  totalBandAdvice,
  type ScoreBand,
  type ScoreBandTone,
} from "@/lib/score-bands";

type SubjectStats = PublicStudentResult["statistics"]["subjects"][number];
type DevelopmentTier = "single" | "top" | "lead" | "strong" | "good" | "steady" | "focus" | "foundation";

type SubjectInsight = SubjectStats & {
  deltaLevel: number;
  advice: string;
  band: ScoreBand | null; // ช่วงคะแนน (decile %) ของวิชานี้ — null ถ้าไม่มีคะแนนเต็ม
  pct: number; // % ของคะแนนเต็ม (ใช้จัดอันดับจุดแข็ง/จุดที่ต้องพัฒนา)
  bandAdvice: string; // คำแนะนำตามช่วงคะแนน (ผสมกับ advice อันดับเดิมในการ์ด)
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatScore(value: number) {
  if (!Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function buildSubjectInsights(subjects: SubjectStats[], seedKey: string): SubjectInsight[] {
  return subjects.map((subject) => {
    const deltaLevel = subject.score - subject.levelAverage;
    const band = scoreBand(subject.score, subject.maxScore);
    const pct = band?.pct ?? (subject.maxScore && subject.maxScore > 0 ? (subject.score / subject.maxScore) * 100 : -1);
    const next = pointsToNextBand(subject.score, subject.maxScore);
    const bandAdvice = band
      ? subjectBandAdvice(
          band,
          subject.name,
          next?.points ?? 0,
          next?.nextLabel ?? null,
          // ผสม seedKey (รหัสนักเรียน) → คนคะแนนเท่ากันได้ประโยคต่างกัน ลดความซ้ำข้ามคน
          textSeed(seedKey, subject.name, subject.score, band.index),
        )
      : "";
    return {
      ...subject,
      deltaLevel,
      advice: subjectAdvice(subject.name, deltaLevel, subject.levelRank, subject.levelCount, subject.score),
      band,
      pct,
      bandAdvice,
    };
  });
}

export function DevelopmentStatsPanel({ result }: { result: PublicStudentResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const { total, subjects } = result.statistics;
  const totalDeltaLevel = total.score - total.levelAverage;
  const totalBand = scoreBand(total.score, total.maxScore);
  const subjectInsights = useMemo(
    () => buildSubjectInsights(subjects, result.student.examNo),
    [subjects, result.student.examNo],
  );
  // จัดอันดับจุดแข็ง/จุดที่ควรพัฒนาด้วย % (ช่วงคะแนน) ถ้ามีคะแนนเต็ม — ไม่งั้น fallback ส่วนต่างจากเฉลี่ย
  const rankedSubjects = useMemo(() => {
    const hasBands = subjectInsights.some((item) => item.band);
    return [...subjectInsights].sort((a, b) => (hasBands ? b.pct - a.pct : b.deltaLevel - a.deltaLevel));
  }, [subjectInsights]);
  const strongestSubject = rankedSubjects[0] ?? null;
  const focusSubject = rankedSubjects.length ? rankedSubjects[rankedSubjects.length - 1] : null;

  // เป้าหมายถัดไป = คำแนะนำตามช่วงคะแนน + คะแนนที่ต้องเพิ่มขึ้นช่วงถัดไป + บริบทอันดับเดิม (ผสม)
  const rankMessage = totalMessage(totalDeltaLevel, total.levelRank, total.levelCount);
  const totalNext = pointsToNextBand(total.score, total.maxScore);
  const goalValue = totalBand ? `${totalBand.label} (${totalBand.rangeLabel})` : "ฝึกต่ออย่างมีทิศทาง";
  const goalDescription = totalBand
    ? `${totalBandAdvice(totalBand, textSeed(result.student.examNo, total.score, totalBand.index))} ${
        totalNext
          ? `เป้าหมายถัดไป: เพิ่มอีก ${formatScore(totalNext.points)} คะแนนเพื่อขึ้นช่วง “${totalNext.nextLabel}”.`
          : "อยู่ช่วงคะแนนสูงสุดแล้ว รักษาระดับนี้ไว้."
      }`
    : `${rankMessage} ${nextGoalText(totalDeltaLevel)}`;
  const panelId = "development-stats-panel";

  return (
    <section className="mt-5 border-t border-sky-100 pt-4">
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
              {isOpen ? "ซ่อนคำแนะนำเพื่อการพัฒนา" : "ดูคำแนะนำเพื่อการพัฒนา"}
            </span>
            <span className="mt-1 block text-sm leading-5 text-[var(--text-muted)]">
              เป้าหมายถัดไป จุดแข็งที่ควรรักษา และวิชาที่ควรเริ่มเสริมก่อน
            </span>
          </span>
        </span>
        <span className="shrink-0 text-sky-700">
          {isOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="mt-4 space-y-4">
          {/* สรุปสั้น: ช่วงคะแนน + ข้อความให้กำลังใจตามผลรวม (ไม่ซ้ำตัวเลข/อันดับที่แสดงด้านบนแล้ว) */}
          <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_30px_rgba(14,165,233,0.07)]">
            <div className="flex flex-wrap items-center gap-2">
              <Target size={18} className="text-sky-700" />
              <h3 className="text-lg font-semibold leading-tight text-slate-950">ภาพรวมเพื่อการพัฒนา</h3>
              {totalBand && <ScoreBandChip band={totalBand} prefix="ช่วงคะแนนรวม" />}
            </div>
            <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">{rankMessage}</p>
          </div>

          {/* คำแนะนำเฉพาะตัว 3 ข้อ */}
          <DevelopmentFocusSection
            goalValue={goalValue}
            goalDescription={goalDescription}
            strongestSubject={strongestSubject}
            focusSubject={focusSubject}
          />
        </div>
      )}
    </section>
  );
}

const bandChipClass: Record<ScoreBandTone, string> = {
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

function ScoreBandChip({ band, prefix }: { band: ScoreBand; prefix?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", bandChipClass[band.tone])}>
      {prefix && <span className="opacity-70">{prefix}</span>}
      {band.label} · {band.rangeLabel}
    </span>
  );
}

function DevelopmentFocusSection({
  goalValue,
  goalDescription,
  strongestSubject,
  focusSubject,
}: {
  goalValue: string;
  goalDescription: string;
  strongestSubject: SubjectInsight | null;
  focusSubject: SubjectInsight | null;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <FocusCard
        icon={<TrendingUp size={18} />}
        title="เป้าหมายถัดไป"
        value={goalValue}
        description={goalDescription}
        tone="sky"
      />
      <FocusCard
        icon={<Medal size={18} />}
        title="รักษาจุดแข็ง"
        value={strongestSubject?.name ?? "-"}
        description={
          strongestSubject
            ? strongestSubject.bandAdvice || strongestSubject.advice
            : "ยังไม่มีข้อมูลรายวิชาสำหรับวิเคราะห์จุดแข็ง"
        }
        band={strongestSubject?.band ?? null}
        tone="emerald"
      />
      <FocusCard
        icon={<Target size={18} />}
        title="เริ่มพัฒนาที่วิชา"
        value={focusSubject?.name ?? "-"}
        description={
          focusSubject
            ? focusSubject.bandAdvice || focusSubject.advice
            : "ยังไม่มีข้อมูลรายวิชาสำหรับวิเคราะห์จุดที่ควรเสริม"
        }
        band={focusSubject?.band ?? null}
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
  band,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
  tone: "sky" | "emerald" | "pink";
  band?: ScoreBand | null;
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
      {band && (
        <div className="mt-2">
          <ScoreBandChip band={band} prefix="ช่วงคะแนน" />
        </div>
      )}
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </article>
  );
}
