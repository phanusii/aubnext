"use client";

import { useState } from "react";
import { Search, XCircle } from "lucide-react";
import { StudentResultCard, type StudentResultResponse } from "@/components/StudentResultCard";

export function CheckResultForm() {
  const [examNo, setExamNo] = useState("");
  const [result, setResult] = useState<StudentResultResponse | null>(null);
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff,#eef8ff)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-5 py-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 max-w-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full" />
          </div>
          <h1 className="text-3xl font-semibold md:text-5xl">เช็คผลสอบส่วนตัว</h1>
          <p className="mt-3 text-[var(--text-muted)]">กรอกรหัสนักเรียนเพื่อดูผลของรอบสอบที่โรงเรียนประกาศ</p>
        </div>

        <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="text-sm font-medium">
              รหัสนักเรียน
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && checkResult()}
                className="app-input mt-1"
                inputMode="numeric"
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
          <div className="mt-5">
            <StudentResultCard result={result} />
          </div>
        )}
      </section>
    </main>
  );
}
