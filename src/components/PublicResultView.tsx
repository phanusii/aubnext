"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Award, BarChart3, ChevronLeft, Medal, School, ShieldCheck, Trophy } from "lucide-react";
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
};

function statusClass(status: StudentResult["result"]["status"]) {
  if (status === "PASSED") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (status === "REVIEW") return "bg-pink-50 text-pink-700 ring-pink-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function percent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function rankPercent(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1) return 100;
  return Math.max(5, Math.min(100, ((count - rank + 1) / count) * 100));
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0f9ff_0%,#fff7fb_58%,#ffffff_100%)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-4 md:px-5 md:py-8">
        <Link href="/check-result" className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-semibold text-[var(--primary-blue-strong)]">
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

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white/95 shadow-[0_18px_55px_rgba(14,165,233,0.10)]">
      <header className="border-b border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#eff9ff_54%,#fff5fb_100%)] p-3.5 md:p-6">
        <div className="flex gap-3 md:gap-4">
          {result.school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.school.logoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-sky-100 md:size-20" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-[var(--primary-blue-strong)] ring-1 ring-sky-100 md:size-20">
              <School size={34} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-tight text-[var(--primary-blue-strong)] md:text-3xl">{result.school.schoolName}</p>
            <h1 className="mt-1 text-xl font-semibold leading-snug text-slate-950 md:text-3xl">{result.exam.name}</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              ระดับชั้น {result.exam.classLevel}
              {publishedAt ? ` · ประกาศวันที่ ${publishedAt}` : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="p-3.5 md:p-6">
        <div className="rounded-[1.5rem] border border-sky-100 bg-white p-3.5 shadow-[0_10px_30px_rgba(14,165,233,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${statusClass(result.result.status)}`}>
              {statusText[result.result.status]}
            </span>
          </div>
          <div className="mt-2">
            <p className="text-sm font-medium text-[var(--text-muted)]">ผู้เข้าสอบ</p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight md:text-3xl">{result.student.name}</h2>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              รหัส {result.student.examNo} · {result.student.classLevel}/{result.student.room}
            </p>
          </div>
        </div>

        <section className="mt-4">
          <SectionTitle title="คะแนนรายวิชา" />
          <div className="mt-2.5 overflow-hidden rounded-[1.35rem] border border-sky-100 bg-white">
            {Object.entries(result.result.scoreBreakdown).map(([subject, score]) => (
              <div key={subject} className="grid grid-cols-[1fr_auto] gap-4 border-b border-sky-50 px-4 py-2.5 last:border-b-0">
                <span className="font-medium text-slate-700">{subject}</span>
                <span className="text-lg font-semibold text-slate-950">{formatScore(score)}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<Award size={18} />} label="คะแนนรวม" value={formatScore(result.result.totalScore)} />
          <Metric icon={<Medal size={18} />} label="อันดับในห้อง" value={`${result.statistics.total.roomRank}/${result.statistics.total.roomCount}`} />
          <Metric icon={<Trophy size={18} />} label="อันดับในชั้น" value={`${result.statistics.total.levelRank}/${result.statistics.total.levelCount}`} />
          <Metric icon={<ShieldCheck size={18} />} label="สถานะ" value={statusText[result.result.status]} />
        </div>

        {result.result.status === "PASSED" && (
          <section className="mt-4 rounded-[1.35rem] border border-sky-100 bg-sky-50 px-4 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
              <ShieldCheck size={18} />
              {passTitle}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]">
              {passInstructions}
            </p>
          </section>
        )}

        <section className="mt-5">
          <SectionTitle title="สถิติเปรียบเทียบคะแนนรวม" icon={<BarChart3 size={18} />} />
          <TotalComparisonChart
            score={result.statistics.total.score}
            roomAverage={result.statistics.total.roomAverage}
            levelAverage={result.statistics.total.levelAverage}
            roomRank={result.statistics.total.roomRank}
            levelRank={result.statistics.total.levelRank}
            roomCount={result.statistics.total.roomCount}
            levelCount={result.statistics.total.levelCount}
          />
        </section>

        <section className="mt-5">
          <SectionTitle title="สถิติเปรียบเทียบคะแนนรายวิชา" icon={<BarChart3 size={18} />} />
          <SubjectComparisonCharts subjects={result.statistics.subjects} />
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

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-sky-100 bg-[#fbfdff] p-3.5 shadow-[0_8px_24px_rgba(14,165,233,0.05)] md:p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)] md:text-sm">
        {icon ? icon : null}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none md:text-3xl">{value}</div>
    </div>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      {icon ? <span className="text-sky-700">{icon}</span> : null}
      <h3 className="text-lg font-semibold leading-tight text-slate-950">{title}</h3>
    </div>
  );
}

function TotalComparisonChart({
  score,
  roomAverage,
  levelAverage,
  roomRank,
  levelRank,
  roomCount,
  levelCount,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  roomRank: number;
  levelRank: number;
  roomCount: number;
  levelCount: number;
}) {
  const maxScore = Math.max(score, roomAverage, levelAverage, 1);
  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,#ffffff,#f0f9ff)] p-4 shadow-[0_10px_30px_rgba(14,165,233,0.08)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sky-900">คะแนนรวมเทียบค่าเฉลี่ย</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">เทียบคะแนนนักเรียนกับค่าเฉลี่ยห้องและทั้งชั้น</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-sky-100">
            <p className="text-xs text-sky-700">คะแนนรวม</p>
            <p className="text-2xl font-semibold text-slate-950">{formatScore(score)}</p>
          </div>
        </div>
        <div className="space-y-3">
          <ChartBar label="นักเรียน" value={score} max={maxScore} colorClass="bg-sky-500" valueClass="text-sky-700" />
          <ChartBar label="เฉลี่ยห้อง" value={roomAverage} max={maxScore} colorClass="bg-pink-400" valueClass="text-pink-700" />
          <ChartBar label="เฉลี่ยทั้งชั้น" value={levelAverage} max={maxScore} colorClass="bg-sky-200" valueClass="text-sky-700" />
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-sky-100 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-pink-500" />
          <p className="text-sm font-semibold text-slate-900">อันดับคะแนนรวม</p>
        </div>
        <div className="space-y-3">
          <RankBar label="อันดับในห้อง" rank={roomRank} count={roomCount} />
          <RankBar label="อันดับทั้งชั้น" rank={levelRank} count={levelCount} />
        </div>
      </div>
    </div>
  );
}

function SubjectComparisonCharts({
  subjects,
}: {
  subjects: StudentResult["statistics"]["subjects"];
}) {
  return (
    <div className="grid gap-3">
      {subjects.map((subject) => {
        const maxScore = Math.max(subject.score, subject.roomAverage, subject.levelAverage, 1);
        return (
          <article key={subject.id} className="rounded-[1.35rem] border border-sky-100 bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-950">{subject.name}</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">เทียบค่าเฉลี่ยและอันดับรายวิชา</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">ห้อง {subject.roomRank}/{subject.roomCount}</span>
                <span className="rounded-full bg-pink-50 px-3 py-1 font-semibold text-pink-700">ชั้น {subject.levelRank}/{subject.levelCount}</span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <ChartBar label="นักเรียน" value={subject.score} max={maxScore} colorClass="bg-sky-500" valueClass="text-sky-700" />
                <ChartBar label="เฉลี่ยห้อง" value={subject.roomAverage} max={maxScore} colorClass="bg-pink-400" valueClass="text-pink-700" />
                <ChartBar label="เฉลี่ยทั้งชั้น" value={subject.levelAverage} max={maxScore} colorClass="bg-sky-200" valueClass="text-sky-700" />
              </div>
              <div className="space-y-3 rounded-2xl bg-[#f8fbff] p-3">
                <RankBar label="อันดับห้อง" rank={subject.roomRank} count={subject.roomCount} compact />
                <RankBar label="อันดับทั้งชั้น" rank={subject.levelRank} count={subject.levelCount} compact />
              </div>
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
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
  valueClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-semibold ${valueClass}`}>{formatScore(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 md:h-3">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${percent(value, max)}%` }} />
      </div>
    </div>
  );
}

function RankBar({ label, rank, count, compact = false }: { label: string; rank: number; count: number; compact?: boolean }) {
  const width = rankPercent(rank, count);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{rank}/{count}</span>
      </div>
      <div className={`${compact ? "h-2.5" : "h-3"} overflow-hidden rounded-full bg-slate-100`}>
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#f9a8d4,#38bdf8)]" style={{ width: `${width}%` }} />
      </div>
      {/* แสดงคำอธิบายเฉพาะแบบเต็ม (คะแนนรวม) — แบบ compact รายวิชาตัดออกเพื่อลดความยาวหน้า */}
      {!compact && <p className="mt-1 text-xs text-[var(--text-muted)]">แถบยิ่งยาว หมายถึงอันดับยิ่งอยู่ด้านบน</p>}
    </div>
  );
}
