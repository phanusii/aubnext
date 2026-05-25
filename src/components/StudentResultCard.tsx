"use client";

import type { ReactNode } from "react";
import { Award, BarChart3, Medal, School, ShieldCheck, Sparkles } from "lucide-react";

export type StudentResultResponse = {
  school: { schoolName: string; logoUrl?: string | null };
  exam: {
    name: string;
    classLevel: string;
    selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
    publishedAt: string | null;
  };
  student: { examNo: string; name: string; classLevel: string; room: string };
  result: {
    rank: number;
    totalScore: number;
    status: "PASSED" | "FAILED" | "REVIEW";
    reason: string;
    scoreBreakdown: Record<string, number>;
  };
  statistics?: {
    total: {
      score: number;
      roomAverage: number;
      levelAverage: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    };
    subjects: Array<{
      id: string;
      name: string;
      score: number;
      roomAverage: number;
      levelAverage: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    }>;
  };
};

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบโดยกรรมการ",
};

function statusClass(status: StudentResultResponse["result"]["status"]) {
  if (status === "PASSED") return "bg-sky-100 text-sky-700";
  if (status === "REVIEW") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function StudentResultCard({ result }: { result: StudentResultResponse }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-solid)] shadow-[var(--shadow-soft)]">
      <div className="grid gap-5 bg-[linear-gradient(135deg,#e0f2fe,#fff0f7)] p-5 md:grid-cols-[1fr_230px] md:items-center">
        <div>
          <div className="flex items-center gap-3">
            {result.school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.school.logoUrl} alt="" className="size-16 rounded-2xl bg-white object-cover ring-2 ring-white" />
            ) : (
              <div className="grid size-16 place-items-center rounded-2xl bg-white text-[var(--primary-blue)] ring-2 ring-white">
                <School size={30} />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{result.school.schoolName}</p>
              <h1 className="text-xl font-semibold leading-tight md:text-2xl">{result.exam.name}</h1>
            </div>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--accent-pink-strong)]">
            <Sparkles size={16} />
            ผลสอบส่วนตัวของนักเรียน
          </div>
        </div>
        <div className="mx-auto max-w-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full drop-shadow-lg" />
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">ผู้เข้าสอบ</p>
            <h2 className="mt-1 text-2xl font-semibold">{result.student.name}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              รหัส {result.student.examNo} · {result.student.classLevel}/{result.student.room}
            </p>
          </div>
          <span className={`rounded-full px-3 py-2 text-sm font-semibold ${statusClass(result.result.status)}`}>
            {statusText[result.result.status]}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <InfoCard icon={<Medal size={18} />} label={result.exam.selectionMode === "PER_ROOM" ? "อันดับในห้อง" : "อันดับทั้งชั้น"} value={String(result.result.rank)} />
          <InfoCard icon={<Award size={18} />} label="คะแนนรวม" value={formatScore(result.result.totalScore)} />
          <InfoCard icon={<ShieldCheck size={18} />} label="สถานะ" value={statusText[result.result.status]} />
        </div>

        {result.statistics && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <BarChart3 size={18} />
              สถิติเปรียบเทียบ
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard label="เฉลี่ยห้อง / ทั้งชั้น" value={`${formatScore(result.statistics.total.roomAverage)} / ${formatScore(result.statistics.total.levelAverage)}`} />
              <InfoCard label="อันดับห้อง / ทั้งชั้น" value={`${result.statistics.total.roomRank}/${result.statistics.total.roomCount} · ${result.statistics.total.levelRank}/${result.statistics.total.levelCount}`} />
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} />
            คะแนนรายวิชา
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border-soft)]">
            {Object.entries(result.result.scoreBreakdown).map(([subject, score]) => (
              <div key={subject} className="flex justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3 last:border-b-0">
                <span>{subject}</span>
                <span className="font-semibold">{formatScore(score)}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 rounded-2xl bg-[var(--blue-wash)] px-4 py-3 text-sm text-[var(--text-muted)]">{result.result.reason}</p>
      </div>
    </article>
  );
}

function InfoCard({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--blue-wash)] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">{icon ? icon : null}{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
