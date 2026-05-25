"use client";

import { useState } from "react";
import { Search, ShieldCheck, XCircle } from "lucide-react";

type ResultResponse = {
  school: { schoolName: string; examTitle: string; logoUrl?: string | null };
  exam: { name: string; classLevel: string; publishedAt: string | null };
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
  const [birthdateOrPin, setBirthdateOrPin] = useState("");
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
      body: JSON.stringify({ examNo, birthdateOrPin }),
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
    <main className="min-h-screen bg-[#f7f3ed] text-[#16211d]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-8">
        <div className="mb-5 text-center">
          <h1 className="text-3xl font-semibold">เช็คผลสอบส่วนตัว</h1>
          <p className="mt-2 text-[#65736d]">กรอกข้อมูลยืนยันตัวตนเพื่อดูผลของตนเอง</p>
        </div>

        <div className="rounded-lg border border-[#d7cdbb] bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm font-medium">
              เลขประจำตัวผู้สอบ
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-[#cfc7b8] px-3 outline-none focus:border-[#1d5c4a]"
              />
            </label>
            <label className="text-sm font-medium">
              วันเกิดหรือ PIN
              <input
                value={birthdateOrPin}
                onChange={(event) => setBirthdateOrPin(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-[#cfc7b8] px-3 outline-none focus:border-[#1d5c4a]"
              />
            </label>
            <button
              type="button"
              onClick={checkResult}
              disabled={busy}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1d5c4a] px-5 font-medium text-white disabled:opacity-60 md:mt-auto"
            >
              <Search size={18} />
              ตรวจผล
            </button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-[#e2b7a4] bg-[#fff5f1] p-3 text-sm text-[#8a341d]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-5 rounded-lg border border-[#d7cdbb] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3dccf] pb-4">
              <div>
                <p className="text-sm text-[#65736d]">{result.school.schoolName}</p>
                <h2 className="mt-1 text-xl font-semibold">{result.exam.name}</h2>
              </div>
              <div
                className={
                  result.result.status === "PASSED"
                    ? "rounded-md bg-[#e8f4ee] px-3 py-2 text-sm font-semibold text-[#1d5c4a]"
                    : result.result.status === "REVIEW"
                      ? "rounded-md bg-[#fff8e6] px-3 py-2 text-sm font-semibold text-[#8a5a00]"
                      : "rounded-md bg-[#f5eeee] px-3 py-2 text-sm font-semibold text-[#8a341d]"
                }
              >
                {statusText[result.result.status]}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-md bg-[#f4f1eb] p-4">
                <div className="text-sm text-[#65736d]">ผู้เข้าสอบ</div>
                <div className="mt-1 font-semibold">{result.student.name}</div>
                <div className="text-sm text-[#65736d]">
                  {result.student.examNo} · {result.student.classLevel}/{result.student.room}
                </div>
              </div>
              <div className="rounded-md bg-[#eef4f7] p-4">
                <div className="text-sm text-[#65736d]">อันดับ</div>
                <div className="mt-1 text-2xl font-semibold">{result.result.rank}</div>
              </div>
              <div className="rounded-md bg-[#f3efe7] p-4">
                <div className="text-sm text-[#65736d]">คะแนนรวม</div>
                <div className="mt-1 text-2xl font-semibold">{result.result.totalScore}</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} />
                คะแนนรายวิชา
              </div>
              <div className="overflow-hidden rounded-md border border-[#e3dccf]">
                {Object.entries(result.result.scoreBreakdown).map(([subject, score]) => (
                  <div key={subject} className="flex justify-between border-b border-[#e3dccf] px-3 py-2 last:border-b-0">
                    <span>{subject}</span>
                    <span className="font-semibold">{score}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm text-[#65736d]">{result.result.reason}</p>
          </div>
        )}
      </section>
    </main>
  );
}
