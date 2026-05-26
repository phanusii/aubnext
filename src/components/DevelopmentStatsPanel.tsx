"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, GraduationCap, LineChart, Medal, Target, TrendingUp } from "lucide-react";
import type { PublicStudentResult } from "@/lib/repository";

type SubjectStats = PublicStudentResult["statistics"]["subjects"][number];
type InsightLevel = "strength" | "above" | "near" | "improve";

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

function subjectAdvice(level: InsightLevel, subjectName: string, deltaLevel: number) {
  if (level === "strength") return `รักษาจุดแข็งใน${subjectName} และลองฝึกโจทย์ระดับยากขึ้น`;
  if (level === "above") return `ต่อยอด${subjectName}ด้วยการทบทวนข้อผิดพลาดเดิมและฝึกทำโจทย์จับเวลา`;
  if (level === "near") return `เพิ่มอีกประมาณ ${formatScore(Math.abs(deltaLevel))} คะแนนจะเข้าใกล้ค่าเฉลี่ยทั้งชั้นมากขึ้น`;
  return `เริ่มเสริม${subjectName}จากพื้นฐานที่ผิดซ้ำ ขอครูช่วยดูจุดผิด แล้วฝึกโจทย์ทีละชุด`;
}

function totalMessage(deltaLevel: number, levelRank: number, levelCount: number) {
  const level = rankBand(levelRank, levelCount);
  if (level === "strength" && deltaLevel >= 0) return "ภาพรวมอยู่ในกลุ่มนำ รักษาความสม่ำเสมอและต่อยอดวิชาที่เป็นจุดแข็ง";
  if (deltaLevel >= 0) return "ภาพรวมทำได้ดี ใช้วิชาที่ควรเสริมก่อนเป็นจุดเริ่มต้นเพื่อขยับขึ้นอีก";
  if (deltaLevel >= -5) return "ภาพรวมใกล้ค่าเฉลี่ย เลือกฝึกวิชาที่แนะนำก่อนจะช่วยให้เห็นผลเร็ว";
  return "ภาพรวมยังมีพื้นที่ให้พัฒนา เริ่มจากวิชาที่ควรเสริมก่อนและฝึกพื้นฐานอย่างสม่ำเสมอ";
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
      advice: subjectAdvice(level, subject.name, deltaLevel),
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
