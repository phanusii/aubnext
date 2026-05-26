"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Award, BarChart3, Medal, School, Search, ShieldCheck, Sparkles, Trophy, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import type { PublicStudentResult } from "@/lib/repository";

type PublicSettings = {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: {
    name: string;
    classLevel: string;
    status: "DRAFT" | "PUBLISHED";
  } | null;
};

export function CheckResultForm({ initialSettings }: { initialSettings: PublicSettings }) {
  const router = useRouter();
  const [examNo, setExamNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [instantResult, setInstantResult] = useState<PublicStudentResult | null>(null);
  const publicSettings = initialSettings;

  useEffect(() => {
    router.prefetch("/check-result/result");
  }, [router]);

  async function checkResult() {
    if (busy) return;
    setBusy(true);
    setError("");
    setInstantResult(null);
    const response = await fetch("/api/check-result/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examNo }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "ไม่พบผลสอบ");
      return;
    }

    if (data.result) {
      setInstantResult(data.result);
      setExamNo("");
      return;
    }

    setBusy(true);
    startTransition(() => {
      router.push("/check-result/result");
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe_0,#fdf2f8_38%,#f8fbff_72%)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-5 sm:py-8">
        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-4 shadow-[0_24px_70px_rgba(14,165,233,0.14)] backdrop-blur md:p-5">
          <div className="flex items-start gap-3">
            {publicSettings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicSettings.logoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-2 ring-pink-100" />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-[var(--primary-blue-strong)]">
                <School size={26} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-700">{publicSettings.schoolName}</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight text-slate-950 md:text-3xl">
                {publicSettings.activeExam?.name ?? "ประกาศผลสอบ"}
              </h1>
              {publicSettings.activeExam?.classLevel && (
                <p className="mt-2 text-xs font-medium text-slate-500">ระดับชั้น {publicSettings.activeExam.classLevel}</p>
              )}
            </div>
          </div>
        </div>

        {!instantResult && (
          <div className="mt-7 text-center">
            <div className="mx-auto mb-4 grid size-20 place-items-center rounded-[1.75rem] bg-white/90 text-sky-500 shadow-[0_18px_45px_rgba(14,165,233,0.16)] ring-1 ring-sky-100">
              <Sparkles size={34} />
            </div>
            <h2 className="text-4xl font-semibold tracking-normal text-slate-950">เช็คผลสอบ</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
              กรอกรหัสนักเรียน ระบบจะแสดงผลคะแนนบนหน้านี้ทันที
            </p>
          </div>
        )}

        <form
          className={instantResult ? "mt-4 rounded-[2rem] border border-white/80 bg-white/90 p-4 shadow-[0_18px_55px_rgba(14,165,233,0.12)] backdrop-blur" : "mt-6 rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(14,165,233,0.12)] backdrop-blur"}
          onSubmit={(event) => {
            event.preventDefault();
            void checkResult();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-sm font-medium">
              รหัสนักเรียน
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                className="app-input mt-2 h-14 rounded-2xl border-sky-100 bg-white text-center text-2xl font-semibold tracking-wide shadow-inner"
                inputMode="numeric"
                autoComplete="off"
                placeholder="เช่น 21410"
              />
            </label>
            <button type="submit" disabled={busy || isPending || !examNo.trim()} className="app-button-primary mt-6 h-14 rounded-2xl px-6 sm:mt-auto">
              <Search size={18} />
              {busy || isPending ? "กำลังตรวจ" : instantResult ? "เช็คอีกครั้ง" : "ดูผลคะแนน"}
            </button>
          </div>

          {(busy || isPending) && !error && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
              กำลังดึงผลจากระบบ โปรดรอสักครู่
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {instantResult && <InstantResultCard result={instantResult} />}

        <AppFooter className={instantResult ? "mt-6" : undefined} />
      </section>
    </main>
  );
}

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบ",
};

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function barPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function InstantResultCard({ result }: { result: PublicStudentResult }) {
  const rankLabel = result.exam.selectionMode === "PER_ROOM" ? "อันดับห้อง" : "อันดับทั้งชั้น";

  return (
    <article className="mt-5 overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
      <div className="bg-[linear-gradient(135deg,#e0f2fe,#ffffff_48%,#fdf2f8)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">ผลสอบส่วนตัว</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-slate-950">{result.student.name}</h2>
            <p className="mt-2 text-sm text-slate-500">รหัส {result.student.examNo} · {result.student.classLevel}/{result.student.room}</p>
          </div>
          <span className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-pink-700 shadow-sm ring-1 ring-pink-100">
            {statusText[result.result.status]}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <MobileMetric icon={<Award size={16} />} label="คะแนนรวม" value={formatScore(result.result.totalScore)} />
          <MobileMetric icon={<Medal size={16} />} label={rankLabel} value={String(result.result.rank)} />
          <MobileMetric icon={<ShieldCheck size={16} />} label="สถานะ" value={statusText[result.result.status]} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={18} className="text-sky-600" />
            <h3 className="font-semibold text-slate-950">เทียบค่าเฉลี่ยคะแนนรวม</h3>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <ScoreBar label="นักเรียน" value={result.statistics.total.score} max={Math.max(result.statistics.total.score, result.statistics.total.roomAverage, result.statistics.total.levelAverage, 1)} color="bg-sky-500" />
            <ScoreBar label="เฉลี่ยห้อง" value={result.statistics.total.roomAverage} max={Math.max(result.statistics.total.score, result.statistics.total.roomAverage, result.statistics.total.levelAverage, 1)} color="bg-pink-400" />
            <ScoreBar label="เฉลี่ยทั้งชั้น" value={result.statistics.total.levelAverage} max={Math.max(result.statistics.total.score, result.statistics.total.roomAverage, result.statistics.total.levelAverage, 1)} color="bg-violet-400" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <RankPill label="อันดับในห้อง" value={`${result.statistics.total.roomRank}/${result.statistics.total.roomCount}`} />
              <RankPill label="อันดับทั้งชั้น" value={`${result.statistics.total.levelRank}/${result.statistics.total.levelCount}`} />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Trophy size={18} className="text-pink-500" />
            <h3 className="font-semibold text-slate-950">กราฟรายวิชา</h3>
          </div>
          <div className="grid gap-3">
            {result.statistics.subjects.map((subject) => {
              const max = Math.max(subject.score, subject.roomAverage, subject.levelAverage, 1);
              return (
                <div key={subject.id} className="rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_10px_30px_rgba(14,165,233,0.07)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">{subject.name}</h4>
                    <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700">อันดับ {subject.roomRank}/{subject.roomCount}</span>
                  </div>
                  <ScoreBar label="นักเรียน" value={subject.score} max={max} color="bg-sky-500" compact />
                  <ScoreBar label="เฉลี่ยห้อง" value={subject.roomAverage} max={max} color="bg-pink-400" compact />
                  <ScoreBar label="เฉลี่ยชั้น" value={subject.levelAverage} max={max} color="bg-violet-400" compact />
                </div>
              );
            })}
          </div>
        </section>

        <p className="rounded-3xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-600">{result.result.reason}</p>

        {result.result.status === "PASSED" && (result.exam.passTitle || result.exam.passInstructions) && (
          <section className="rounded-3xl border border-pink-100 bg-pink-50 px-4 py-3">
            <p className="text-sm font-semibold text-pink-800">{result.exam.passTitle ?? "แจ้งสำหรับผู้ผ่านการคัดเลือก"}</p>
            {result.exam.passInstructions && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{result.exam.passInstructions}</p>}
          </section>
        )}

        <button
          type="button"
          onClick={() => {
            startViewTransition(() => window.location.assign("/check-result/result"));
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 py-3 font-semibold text-sky-700 shadow-sm"
        >
          เปิดหน้าเต็ม
          <ArrowUpRight size={18} />
        </button>
      </div>
    </article>
  );
}

function startViewTransition(action: () => void) {
  action();
}

function MobileMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/90 p-3 text-center shadow-sm ring-1 ring-white">
      <div className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-sky-50 text-sky-600">{icon}</div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold leading-tight text-slate-950 sm:text-lg">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value, max, color, compact = false }: { label: string; value: number; max: number; color: string; compact?: boolean }) {
  return (
    <div className={compact ? "mt-2" : "mt-3 first:mt-0"}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{formatScore(value)}</span>
      </div>
      <div className={compact ? "h-2 overflow-hidden rounded-full bg-slate-200" : "h-3 overflow-hidden rounded-full bg-slate-200"}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${barPercent(value, max)}%` }} />
      </div>
    </div>
  );
}

function RankPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2 text-center ring-1 ring-slate-100">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
