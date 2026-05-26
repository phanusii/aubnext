"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, GraduationCap, LineChart, Medal, Target, TrendingUp } from "lucide-react";
import type { PublicStudentResult } from "@/lib/repository";

type SubjectStats = PublicStudentResult["statistics"]["subjects"][number];
type InsightLevel = "strength" | "above" | "near" | "improve";

type SubjectInsight = SubjectStats & {
  deltaRoom: number;
  deltaLevel: number;
  roomTopPercent: number | null;
  levelTopPercent: number | null;
  level: InsightLevel;
  label: string;
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

function formatDelta(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) < 0.005) return "เท่าค่าเฉลี่ย";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatScore(value)}`;
}

function formatTopPercent(value: number | null) {
  if (value == null) return "ยังไม่มีข้อมูลกลุ่ม";
  return `Top ${value < 1 ? "<1" : value.toFixed(0)}%`;
}

function topPercent(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return null;
  return Math.max(1, Math.min(100, (rank / count) * 100));
}

function rankPositionPercent(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1 || rank <= 0) return 100;
  return Math.max(6, Math.min(100, ((count - rank + 1) / count) * 100));
}

function comparisonPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function classifySubject(deltaLevel: number, levelTop: number | null): InsightLevel {
  if (deltaLevel >= 0 && levelTop != null && levelTop <= 25) return "strength";
  if (deltaLevel >= 0) return "above";
  if (deltaLevel >= -3) return "near";
  return "improve";
}

function subjectLabel(level: InsightLevel) {
  if (level === "strength") return "จุดแข็ง";
  if (level === "above") return "เหนือค่าเฉลี่ย";
  if (level === "near") return "ใกล้ค่าเฉลี่ย";
  return "ควรเสริม";
}

function subjectAdvice(level: InsightLevel, subjectName: string) {
  if (level === "strength") return `รักษาความสม่ำเสมอใน${subjectName} และลองฝึกโจทย์ระดับยากขึ้นเพื่อเพิ่มความมั่นใจ`;
  if (level === "above") return `ต่อยอด${subjectName}ด้วยการทบทวนข้อผิดพลาดเดิมและฝึกทำโจทย์จับเวลา`;
  if (level === "near") return `เพิ่มเวลาทบทวนพื้นฐานของ${subjectName}อีกเล็กน้อย แล้วทำแบบฝึกหัดสั้น ๆ อย่างสม่ำเสมอ`;
  return `เริ่มเสริม${subjectName}จากหัวข้อพื้นฐานที่ผิดซ้ำ ขอครูช่วยชี้จุดอ่อน แล้วฝึกโจทย์ทีละชุด`;
}

function totalMessage(deltaLevel: number) {
  if (deltaLevel > 0) return "ภาพรวมทำได้สูงกว่าเฉลี่ยทั้งชั้น รักษาจุดแข็งไว้และเสริมวิชาที่ต่างจากเฉลี่ยน้อยที่สุด";
  if (Math.abs(deltaLevel) < 0.005) return "ภาพรวมอยู่ใกล้ค่าเฉลี่ยทั้งชั้นมาก ใช้รายวิชาด้านล่างเพื่อเลือกจุดฝึกต่อ";
  if (deltaLevel >= -5) return "ภาพรวมใกล้ค่าเฉลี่ยทั้งชั้น เสริมอีกเล็กน้อยในวิชาที่แนะนำจะช่วยให้ขยับขึ้นได้";
  return "ภาพรวมยังมีพื้นที่ให้พัฒนา เลือกเริ่มจากวิชาที่ควรเสริมก่อนเพื่อเห็นผลชัดเจนขึ้น";
}

function buildSubjectInsights(subjects: SubjectStats[]) {
  return subjects.map((subject) => {
    const deltaRoom = subject.score - subject.roomAverage;
    const deltaLevel = subject.score - subject.levelAverage;
    const roomTop = topPercent(subject.roomRank, subject.roomCount);
    const levelTop = topPercent(subject.levelRank, subject.levelCount);
    const level = classifySubject(deltaLevel, levelTop);
    return {
      ...subject,
      deltaRoom,
      deltaLevel,
      roomTopPercent: roomTop,
      levelTopPercent: levelTop,
      level,
      label: subjectLabel(level),
      advice: subjectAdvice(level, subject.name),
    };
  });
}

export function DevelopmentStatsPanel({ result }: { result: PublicStudentResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const { total, subjects } = result.statistics;
  const totalDeltaRoom = total.score - total.roomAverage;
  const totalDeltaLevel = total.score - total.levelAverage;
  const roomTop = topPercent(total.roomRank, total.roomCount);
  const levelTop = topPercent(total.levelRank, total.levelCount);
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
              วิเคราะห์จุดแข็ง จุดที่ควรเสริม และแนวทางฝึกต่อจากคะแนนรายวิชา
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
            roomTop={roomTop}
            levelTop={levelTop}
          />

          <ComparisonAndRankSection
            score={total.score}
            roomAverage={total.roomAverage}
            levelAverage={total.levelAverage}
            roomRank={total.roomRank}
            roomCount={total.roomCount}
            levelRank={total.levelRank}
            levelCount={total.levelCount}
            roomTop={roomTop}
            levelTop={levelTop}
          />

          <DevelopmentFocusSection
            message={totalMessage(totalDeltaLevel)}
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
  roomTop,
  levelTop,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  deltaRoom: number;
  deltaLevel: number;
  roomTop: number | null;
  levelTop: number | null;
}) {
  return (
    <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_30px_rgba(14,165,233,0.07)]">
      <div className="mb-4 flex items-center gap-2">
        <Target size={18} className="text-sky-700" />
        <h3 className="text-lg font-semibold leading-tight text-slate-950">ภาพรวมเพื่อการพัฒนา</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InsightCard label="คะแนนรวม" value={formatScore(score)} tone="sky" />
        <InsightCard label="อันดับในห้อง" value={formatTopPercent(roomTop)} subValue={`เฉลี่ยห้อง ${formatScore(roomAverage)}`} tone="pink" />
        <InsightCard label="อันดับทั้งชั้น" value={formatTopPercent(levelTop)} subValue={`เฉลี่ยชั้น ${formatScore(levelAverage)}`} tone="sky" />
        <InsightCard label="เทียบเฉลี่ยห้อง" value={formatDelta(deltaRoom)} subValue={deltaRoom >= 0 ? "เหนือหรือเท่าค่าเฉลี่ย" : "ยังเสริมเพิ่มได้"} tone={deltaRoom >= 0 ? "emerald" : "amber"} />
        <InsightCard label="เทียบเฉลี่ยชั้น" value={formatDelta(deltaLevel)} subValue={deltaLevel >= 0 ? "เหนือหรือเท่าค่าเฉลี่ย" : "ใช้เป็นเป้าหมายถัดไป"} tone={deltaLevel >= 0 ? "emerald" : "amber"} />
      </div>
      <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
        {totalMessage(deltaLevel)}
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
  roomTop,
  levelTop,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  roomRank: number;
  roomCount: number;
  levelRank: number;
  levelCount: number;
  roomTop: number | null;
  levelTop: number | null;
}) {
  const maxScore = Math.max(score, roomAverage, levelAverage, 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-sky-700" />
          <h3 className="text-base font-semibold text-slate-950">กราฟเทียบค่าเฉลี่ย</h3>
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
          <h3 className="text-base font-semibold text-slate-950">แถบอันดับ</h3>
        </div>
        <div className="space-y-4">
          <DevelopmentRankBar label="ในห้อง" rank={roomRank} count={roomCount} topPercentValue={roomTop} />
          <DevelopmentRankBar label="ทั้งชั้น" rank={levelRank} count={levelCount} topPercentValue={levelTop} />
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
        <div className={cx("h-full rounded-full", barClass)} style={{ width: `${comparisonPercent(value, max)}%` }} />
      </div>
    </div>
  );
}

function DevelopmentRankBar({
  label,
  rank,
  count,
  topPercentValue,
}: {
  label: string;
  rank: number;
  count: number;
  topPercentValue: number | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">อันดับ{label}</span>
        <span className="font-semibold text-slate-950">
          {rank}/{count} · {formatTopPercent(topPercentValue)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#f9a8d4)]" style={{ width: `${rankPositionPercent(rank, count)}%` }} />
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">แถบยิ่งยาว หมายถึงอยู่ใกล้อันดับต้น ๆ ของกลุ่ม</p>
    </div>
  );
}

function DevelopmentFocusSection({
  message,
  strongestSubject,
  focusSubject,
}: {
  message: string;
  strongestSubject: SubjectInsight | null;
  focusSubject: SubjectInsight | null;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <FocusCard
        icon={<TrendingUp size={18} />}
        title="แนวทางภาพรวม"
        value="เป้าหมายถัดไป"
        description={message}
        tone="sky"
      />
      <FocusCard
        icon={<Medal size={18} />}
        title="จุดแข็งหลัก"
        value={strongestSubject?.name ?? "-"}
        description={strongestSubject ? strongestSubject.advice : "ยังไม่มีข้อมูลรายวิชาสำหรับวิเคราะห์จุดแข็ง"}
        tone="emerald"
      />
      <FocusCard
        icon={<Target size={18} />}
        title="ควรเสริมก่อน"
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
  icon: React.ReactNode;
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
          ใช้ส่วนต่างจากค่าเฉลี่ยและอันดับเพื่อเลือกวิธีฝึกที่เหมาะกับแต่ละวิชา
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

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <SubjectMetric label="เทียบเฉลี่ยห้อง" value={formatDelta(subject.deltaRoom)} />
                <SubjectMetric label="เทียบเฉลี่ยชั้น" value={formatDelta(subject.deltaLevel)} />
                <SubjectMetric label="อันดับห้อง" value={`${subject.roomRank}/${subject.roomCount} · ${formatTopPercent(subject.roomTopPercent)}`} />
                <SubjectMetric label="อันดับทั้งชั้น" value={`${subject.levelRank}/${subject.levelCount} · ${formatTopPercent(subject.levelTopPercent)}`} />
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">ตำแหน่งเทียบเฉลี่ยทั้งชั้น</span>
                  <span className={cx("font-semibold", style.text)}>{formatDelta(subject.deltaLevel)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={cx("h-full rounded-full", style.bar)} style={{ width: `${rankPositionPercent(subject.levelRank, subject.levelCount)}%` }} />
                </div>
              </div>

              <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-[var(--text-muted)] ring-1 ring-sky-50">
                {subject.advice}
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
