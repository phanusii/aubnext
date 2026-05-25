"use client";

import { useState } from "react";
import { Award, Search, ShieldCheck, XCircle } from "lucide-react";

type ResultResponse = {
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
};

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบโดยกรรมการ",
};

export function CheckResultForm() {
  const [examNo, setExamNo] = useState("");
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkResult() {
    setBusy(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/check-result", {
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

    setResult(data);
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--pink-wash)] text-[var(--accent-pink-strong)]">
            <Award size={28} />
          </div>
          <h1 className="text-3xl font-semibold md:text-5xl">เช็คผลสอบส่วนตัว</h1>
          <p className="mt-3 text-[var(--text-muted)]">กรอกเลขประจำตัวผู้สอบเพื่อดูผลของรอบสอบที่โรงเรียนประกาศ</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="text-sm font-medium">
              เลขประจำตัวผู้สอบ
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && checkResult()}
                className="app-input mt-1"
              />
            </label>
            <button type="button" onClick={checkResult} disabled={busy} className="app-button-primary mt-6 md:mt-auto">
              <Search size={18} />
              ตรวจผล
            </button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
              <div>
                <p className="text-sm text-[var(--text-muted)]">{result.school.schoolName}</p>
                <h2 className="mt-1 text-xl font-semibold">{result.exam.name}</h2>
              </div>
              <div
                className={
                  result.result.status === "PASSED"
                    ? "rounded-full bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-700"
                    : result.result.status === "REVIEW"
                      ? "rounded-full bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700"
                      : "rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600"
                }
              >
                {statusText[result.result.status]}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <InfoBlock label="ผู้เข้าสอบ" value={result.student.name} detail={`${result.student.examNo} · ${result.student.classLevel}/${result.student.room}`} />
              <InfoBlock label={result.exam.selectionMode === "PER_ROOM" ? "อันดับในห้อง" : "อันดับทั้งชั้น"} value={String(result.result.rank)} />
              <InfoBlock label="คะแนนรวม" value={String(result.result.totalScore)} />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} />
                คะแนนรายวิชา
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--border-soft)]">
                {Object.entries(result.result.scoreBreakdown).map(([subject, score]) => (
                  <div key={subject} className="flex justify-between border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0">
                    <span>{subject}</span>
                    <span className="font-semibold">{score}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm text-[var(--text-muted)]">{result.result.reason}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function InfoBlock({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl bg-[var(--blue-wash)] p-4">
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {detail && <div className="mt-1 text-sm text-[var(--text-muted)]">{detail}</div>}
    </div>
  );
}
