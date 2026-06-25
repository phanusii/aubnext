"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { BarChart3, ChevronLeft, School } from "lucide-react";
import type { PublicStudentResult } from "@/lib/repository";

// แผง "ภาพรวมเพื่อการพัฒนา" ใหญ่ (~560 บรรทัด) และพับเก็บ default + อยู่ใต้ fold
// → lazy-load แยก chunk โหลดทีหลัง ลด JS ที่ต้อง parse ตอนเปิดหน้าผลครั้งแรก (เร็วขึ้นบนมือถือ)
const DevelopmentStatsPanel = dynamic(
  () => import("@/components/DevelopmentStatsPanel").then((m) => m.DevelopmentStatsPanel),
  {
    ssr: false,
    loading: () => (
      <section className="mt-5 border-t border-sky-100 pt-4">
        <div className="h-[68px] animate-pulse rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#fff7fb)]" />
      </section>
    ),
  },
);

export type StudentResult = PublicStudentResult;

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบ",
  ABSENT: "ไม่ได้เข้าสอบ",
};

// คอนเฟตตีร่วงในหัวการ์ด (เฉพาะคนที่ผ่าน) — CSS ล้วน เบา ไม่กระตุกบนมือถือ
const confettiCss = `
@keyframes resultConfettiFall {
  0% { transform: translateY(-12px) rotate(0deg); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translateY(130px) rotate(360deg); opacity: 0; }
}
.confetti { position:absolute; top:-12px; width:7px; height:11px; border-radius:2px; animation: resultConfettiFall 2.6s ease-in infinite; }
@media (prefers-reduced-motion: reduce) { .confetti { animation: none; opacity: 0; } }
`;
const CONFETTI = [
  { left: "8%", color: "#f472b6", delay: "0s" },
  { left: "20%", color: "#38bdf8", delay: "0.5s" },
  { left: "33%", color: "#a78bfa", delay: "1.1s" },
  { left: "46%", color: "#fbbf24", delay: "0.2s" },
  { left: "60%", color: "#34d399", delay: "0.8s" },
  { left: "72%", color: "#f472b6", delay: "1.4s" },
  { left: "85%", color: "#38bdf8", delay: "0.35s" },
  { left: "93%", color: "#a78bfa", delay: "0.95s" },
];

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function percent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function formatPublishedAt(value: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ResultShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e0f2fe_0%,#ede9fe_42%,#fce7f3_100%)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3 py-4 md:px-5 md:py-8">
        <Link href="/check-result" className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-sm font-semibold text-[var(--primary-blue-strong)] shadow-sm backdrop-blur">
          <ChevronLeft size={18} />
          กลับไปกรอกรหัส
        </Link>
        {children}
      </section>
    </main>
  );
}

export function ResultContent({ result }: { result: StudentResult }) {
  const publishedAt = formatPublishedAt(result.exam.publishedAt);
  const passTitle = result.exam.passTitle?.trim() || "ผ่านการคัดเลือก";
  const passInstructions = result.exam.passInstructions?.trim() || "กรุณาติดตามรายละเอียดและขั้นตอนถัดไปจากประกาศของโรงเรียน";

  const celebrate = result.result.status === "PASSED";

  // คนขาดสอบ: แสดงแค่หัวการ์ด + แถบ "ไม่ได้เข้าสอบ" (ไม่มีคะแนน/อันดับ/สถิติ)
  if (result.result.status === "ABSENT") {
    return (
      <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.10)]">
        <header className="bg-[linear-gradient(135deg,#cbd5e1_0%,#e2e8f0_100%)] p-4 md:p-6">
          <div className="flex gap-3 md:gap-4">
            {result.school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.school.logoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/60 md:size-20" />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/60 text-slate-500 ring-2 ring-white/60 md:size-20">
                <School size={34} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight text-slate-800 md:text-2xl">{result.school.schoolName}</p>
              <h1 className="mt-1 text-base font-semibold leading-snug text-slate-700 md:text-2xl">{result.exam.name}</h1>
              <p className="mt-2 text-xs text-slate-600 md:text-sm">ระดับชั้น {result.exam.classLevel}</p>
            </div>
          </div>
        </header>
        <div className="p-6 text-center md:p-8">
          <p className="text-sm font-medium text-[var(--text-muted)]">ผู้เข้าสอบ</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-slate-900 md:text-3xl">{result.student.name}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            รหัส {result.student.examNo} · {result.student.classLevel}/{result.student.room}
          </p>
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-6 py-3.5 text-lg font-bold text-slate-600 ring-1 ring-slate-200">
            ไม่ได้เข้าสอบ
          </div>
        </div>
      </article>
    );
  }

  // คะแนนเต็มรายวิชา/รวม (จาก statistics ถ้ามี) → แสดง "/เต็ม" แบบจาง ไม่เพิ่มความสูง
  const maxByName = new Map<string, number>();
  for (const subject of result.statistics.subjects) {
    if (subject.name && typeof subject.maxScore === "number" && subject.maxScore > 0) maxByName.set(subject.name, subject.maxScore);
  }
  const totalMax = result.statistics.total.maxScore;
  const maxSuffix = (max?: number, size = "text-sm") =>
    max && max > 0 ? <span className={`${size} font-normal opacity-60`}>/{formatScore(max)}</span> : null;

  const total = result.statistics.total;
  const totalCmpMax = Math.max(total.score, total.roomAverage, total.levelAverage, 1);

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/95 shadow-[0_24px_70px_rgba(219,39,119,0.16)]">
      <style>{confettiCss}</style>
      <header className="relative overflow-hidden bg-[linear-gradient(135deg,#38bdf8_0%,#a78bfa_52%,#f472b6_100%)] p-4 md:p-6">
        {celebrate && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {CONFETTI.map((c, i) => (
              <span key={i} className="confetti" style={{ left: c.left, background: c.color, animationDelay: c.delay }} />
            ))}
          </div>
        )}
        <div className="relative flex gap-3 md:gap-4">
          {result.school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.school.logoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/60 md:size-20" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/25 text-white ring-2 ring-white/50 backdrop-blur md:size-20">
              <School size={34} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-white md:text-2xl">{result.school.schoolName}</p>
            <h1 className="mt-1 text-base font-semibold leading-snug text-white/95 md:text-2xl">{result.exam.name}</h1>
            <p className="mt-2 text-xs text-white/85 md:text-sm">
              ระดับชั้น {result.exam.classLevel}
              {publishedAt ? ` · ประกาศ ${publishedAt}` : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5 p-3 md:p-6">
        {/* ── บล็อก 1: สรุปผล (สถานะ + ชื่อ + คะแนนรวมเด่น + อันดับ) ── */}
        <section className="rounded-[1.5rem] bg-[linear-gradient(135deg,#f0f9ff,#fdf2f8)] p-4 ring-1 ring-white/70 shadow-[0_10px_30px_rgba(14,165,233,0.08)] md:p-5">
          <span className={`inline-flex w-fit items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm bg-gradient-to-r ${celebrate ? "from-emerald-400 to-green-500" : result.result.status === "REVIEW" ? "from-amber-400 to-amber-500" : "from-slate-400 to-slate-500"}`}>
            {celebrate ? "🎉 " : ""}{statusText[result.result.status]}
          </span>
          <div className="mt-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">ผู้เข้าสอบ</p>
            <h2 className="mt-0.5 text-2xl font-semibold leading-tight md:text-3xl">{result.student.name}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              รหัส {result.student.examNo} · ห้อง {result.student.classLevel}/{result.student.room}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {/* คะแนนรวม — ตัวเลขเด่นที่สุด */}
            <div className="col-span-2 rounded-[1.35rem] bg-gradient-to-br from-pink-100 to-pink-50 p-4 shadow-[0_8px_24px_rgba(244,114,182,0.10)] sm:col-span-1">
              <div className="text-xs font-semibold text-pink-700/80 md:text-sm">🏆 คะแนนรวม</div>
              <div className="mt-1 text-[2rem] font-bold leading-none text-pink-700 md:text-[2.4rem]">
                {formatScore(result.result.totalScore)}{maxSuffix(totalMax, "text-lg")}
              </div>
            </div>
            <Metric emoji="🥇" label="อันดับในห้อง" value={`${total.roomRank}/${total.roomCount}`} tone="sky" />
            <Metric emoji="🎖" label="อันดับในชั้น" value={`${total.levelRank}/${total.levelCount}`} tone="violet" />
          </div>

          {celebrate && (
            <div className="mt-3 overflow-hidden rounded-[1.35rem] bg-[linear-gradient(135deg,#dcfce7,#d1fae5)] px-4 py-3.5 ring-1 ring-emerald-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">🎉 {passTitle}</div>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-emerald-900/80">{passInstructions}</p>
            </div>
          )}
        </section>

        {/* ── บล็อก 2: คะแนนแต่ละวิชา ── */}
        <section>
          <SectionTitle title="คะแนนแต่ละวิชา" emoji="📘" />
          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(result.result.scoreBreakdown).map(([subject, score], idx) => {
              const sky = idx % 2 === 0;
              return (
                <div key={subject} className={`flex items-center justify-between gap-2 rounded-2xl px-3.5 py-3 bg-gradient-to-br ${sky ? "from-sky-50 to-sky-100" : "from-pink-50 to-pink-100"}`}>
                  <span className={`min-w-0 truncate text-sm font-medium ${sky ? "text-sky-800" : "text-pink-800"}`}>{subject}</span>
                  <span className={`shrink-0 text-xl font-semibold ${sky ? "text-sky-700" : "text-pink-700"}`}>{formatScore(score)}{maxSuffix(maxByName.get(subject))}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── บล็อก 3: เทียบกับเพื่อน ๆ (คะแนนรวม + รายวิชา รวมเป็นหัวข้อเดียว) ── */}
        <section>
          <SectionTitle title="เทียบกับเพื่อน ๆ" icon={<BarChart3 size={18} />} />
          <p className="-mt-1 mb-2.5 text-xs text-[var(--text-muted)]">
            แถบยิ่งยาว = คะแนนยิ่งสูง ดูว่าคะแนนของเราเทียบกับค่าเฉลี่ยห้องและทั้งชั้นเป็นอย่างไร
          </p>
          <div className="space-y-3">
            <div className="rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,#ffffff,#f0f9ff)] p-4 shadow-[0_10px_30px_rgba(14,165,233,0.08)]">
              <p className="mb-3 text-sm font-semibold text-sky-900">คะแนนรวม</p>
              <div className="space-y-2.5">
                <ChartBar label="ของเรา" value={total.score} max={totalCmpMax} colorClass="bg-gradient-to-r from-sky-400 to-sky-600" valueClass="text-sky-700" highlight />
                <ChartBar label="เฉลี่ยห้อง" value={total.roomAverage} max={totalCmpMax} colorClass="bg-gradient-to-r from-pink-300 to-pink-500" valueClass="text-pink-700" />
                <ChartBar label="เฉลี่ยทั้งชั้น" value={total.levelAverage} max={totalCmpMax} colorClass="bg-gradient-to-r from-sky-200 to-sky-300" valueClass="text-sky-600" />
              </div>
            </div>
            <SubjectComparisonCharts subjects={result.statistics.subjects} />
          </div>
        </section>

        <DevelopmentStatsPanel result={result} />
      </div>
    </article>
  );
}

export function MissingResult({
  schoolName,
  logoUrl,
  activeExam,
  message = "ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง",
}: {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: { name: string; classLevel: string } | null;
  message?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-6 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mx-auto mb-4 grid size-16 place-items-center overflow-hidden rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          <School size={30} />
        )}
      </div>
      <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{schoolName}</p>
      <h1 className="mx-auto mt-2 max-w-2xl text-2xl font-semibold leading-tight md:text-3xl">
        {activeExam?.name ?? "ประกาศผลสอบ"}
      </h1>
      {activeExam?.classLevel && <p className="mt-2 text-sm text-[var(--text-muted)]">ระดับชั้น {activeExam.classLevel}</p>}
      <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[var(--text-muted)]">{message}</p>
      <Link href="/check-result" className="app-button-primary mt-5">
        กรอกรหัสนักเรียน
      </Link>
    </div>
  );
}

type MetricTone = "pink" | "sky" | "violet" | "emerald" | "slate";

function Metric({ emoji, label, value, tone }: { emoji: string; label: string; value: ReactNode; tone: MetricTone }) {
  const toneClass: Record<MetricTone, { box: string; label: string; value: string }> = {
    pink: { box: "from-pink-50 to-pink-100", label: "text-pink-700/80", value: "text-pink-700" },
    sky: { box: "from-sky-50 to-sky-100", label: "text-sky-700/80", value: "text-sky-700" },
    violet: { box: "from-violet-50 to-violet-100", label: "text-violet-700/80", value: "text-violet-700" },
    emerald: { box: "from-emerald-50 to-emerald-100", label: "text-emerald-700/80", value: "text-emerald-700" },
    slate: { box: "from-slate-50 to-slate-100", label: "text-slate-600", value: "text-slate-700" },
  };
  const t = toneClass[tone];
  return (
    <div className={`rounded-[1.35rem] bg-gradient-to-br ${t.box} p-3.5 shadow-[0_8px_24px_rgba(14,165,233,0.06)] md:p-4`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${t.label} md:text-sm`}>
        <span>{emoji}</span>
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold leading-tight ${t.value} md:text-2xl`}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, icon, emoji }: { title: string; icon?: ReactNode; emoji?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      {emoji ? <span className="text-base">{emoji}</span> : null}
      {icon ? <span className="text-sky-700">{icon}</span> : null}
      <h3 className="text-lg font-semibold leading-tight text-slate-950">{title}</h3>
    </div>
  );
}

function SubjectComparisonCharts({
  subjects,
}: {
  subjects: StudentResult["statistics"]["subjects"];
}) {
  return (
    <div className="space-y-3">
      {subjects.map((subject) => {
        const maxScore = Math.max(subject.score, subject.roomAverage, subject.levelAverage, 1);
        return (
          <article key={subject.id} className="rounded-[1.35rem] border border-sky-100 bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-950">{subject.name}</h4>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">ห้อง {subject.roomRank}/{subject.roomCount}</span>
                <span className="rounded-full bg-pink-50 px-3 py-1 font-semibold text-pink-700">ชั้น {subject.levelRank}/{subject.levelCount}</span>
              </div>
            </div>
            <div className="space-y-2.5">
              <ChartBar label="ของเรา" value={subject.score} max={maxScore} colorClass="bg-gradient-to-r from-sky-400 to-sky-600" valueClass="text-sky-700" highlight />
              <ChartBar label="เฉลี่ยห้อง" value={subject.roomAverage} max={maxScore} colorClass="bg-gradient-to-r from-pink-300 to-pink-500" valueClass="text-pink-700" />
              <ChartBar label="เฉลี่ยทั้งชั้น" value={subject.levelAverage} max={maxScore} colorClass="bg-gradient-to-r from-sky-200 to-sky-300" valueClass="text-sky-600" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ChartBar({
  label,
  value,
  max,
  colorClass,
  valueClass,
  highlight = false,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
  valueClass: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className={highlight ? "font-semibold text-slate-900" : "font-medium text-slate-600"}>{label}</span>
        <span className={`font-semibold ${valueClass}`}>{formatScore(value)}</span>
      </div>
      <div className={`overflow-hidden rounded-full bg-slate-100 ${highlight ? "h-3 md:h-3.5" : "h-2.5"}`}>
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${percent(value, max)}%` }} />
      </div>
    </div>
  );
}
