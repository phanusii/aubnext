"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { School, Search, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

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
  const publicSettings = initialSettings;

  async function checkResult() {
    if (busy) return;
    setBusy(true);
    setError("");
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

    router.push("/check-result/result");
  }

  return (
    <main className="min-h-screen bg-[#f7fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-8">
        <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-4">
            {publicSettings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicSettings.logoUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-[var(--border-soft)]" />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)]">
                <School size={30} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{publicSettings.schoolName}</p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-3xl">
                {publicSettings.activeExam?.name ?? "ประกาศผลสอบ"}
              </h1>
              {publicSettings.activeExam?.classLevel && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">ระดับชั้น {publicSettings.activeExam.classLevel}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="mx-auto mb-4 max-w-28 opacity-95">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full" />
          </div>
          <h2 className="text-3xl font-semibold tracking-normal md:text-4xl">เช็คผลสอบส่วนตัว</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--text-muted)]">
            กรอกรหัสนักเรียน แล้วระบบจะเปิดหน้าผลคะแนนเฉพาะบุคคล
          </p>
        </div>

        <form
          className="mt-6 rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
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
                className="app-input mt-2 text-lg"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <button type="submit" disabled={busy} className="app-button-primary mt-6 sm:mt-auto">
              <Search size={18} />
              {busy ? "กำลังตรวจ" : "ตรวจผล"}
            </button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
        <AppFooter />
      </section>
    </main>
  );
}
