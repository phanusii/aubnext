"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { School, Search, Sparkles, XCircle } from "lucide-react";
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
  const [isPending, startTransition] = useTransition();
  const publicSettings = initialSettings;

  useEffect(() => {
    router.prefetch("/check-result/result");
  }, [router]);

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
              <p className="text-lg font-semibold leading-tight text-sky-700 md:text-xl">{publicSettings.schoolName}</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight text-slate-950 md:text-3xl">
                {publicSettings.activeExam?.name ?? "ประกาศผลสอบ"}
              </h1>
              {publicSettings.activeExam?.classLevel && (
                <p className="mt-2 text-xs font-medium text-slate-500">ระดับชั้น {publicSettings.activeExam.classLevel}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-7 text-center">
          <div className="mx-auto mb-4 grid size-20 place-items-center rounded-[1.75rem] bg-white/90 text-sky-500 shadow-[0_18px_45px_rgba(14,165,233,0.16)] ring-1 ring-sky-100">
            <Sparkles size={34} />
          </div>
          <h2 className="text-4xl font-semibold tracking-normal text-slate-950">เช็คผลสอบ</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            กรอกรหัสนักเรียน ระบบจะเปิดหน้าแสดงผลแบบเต็มทันที
          </p>
        </div>

        <form
          className="mt-6 rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(14,165,233,0.12)] backdrop-blur"
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
              {busy || isPending ? "กำลังตรวจ" : "ดูผลคะแนน"}
            </button>
          </div>

          {(busy || isPending) && !error && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
              กำลังเปิดหน้าแสดงผลแบบเต็ม โปรดรอสักครู่
            </div>
          )}

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
