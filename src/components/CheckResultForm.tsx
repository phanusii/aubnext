"use client";

import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { cacheStudentResultForPage, studentResultSessionStorageKey } from "@/components/ResultPageClient";

// header = การ์ดหัวเรื่อง (settings) ที่ส่งมาจาก server เป็น slot — ห่อ <Suspense> ไว้ฝั่ง page
// ตัวฟอร์มเองเป็น static shell ล้วน ๆ จึง prerender แล้ว serve จาก CDN ได้ทันที
export function CheckResultForm({ header }: { header: ReactNode }) {
  const router = useRouter();
  const [examNo, setExamNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

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
      try {
        window.sessionStorage.removeItem(studentResultSessionStorageKey);
      } catch {
        // Ignore unavailable session storage.
      }
      setError(data.error ?? "ไม่พบผลสอบ");
      return;
    }

    if (data.result) {
      cacheStudentResultForPage(data.result);
    }

    setBusy(true);
    startTransition(() => {
      router.push("/check-result/result");
    });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0f9ff_0%,#fff7fb_55%,#ffffff_100%)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-5 sm:py-8">
        <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 p-4 shadow-[0_18px_55px_rgba(14,165,233,0.10)] backdrop-blur md:p-5">
          {header}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm font-semibold text-sky-700">ระบบประกาศผลสอบ</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">เช็คผลสอบ</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">กรอกรหัสนักเรียนเพื่อดูผลคะแนน</p>
        </div>

        <form
          className="mt-6 rounded-[1.75rem] border border-sky-100 bg-white/95 p-4 shadow-[0_18px_55px_rgba(14,165,233,0.10)] backdrop-blur sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void checkResult();
          }}
        >
          <div className="grid gap-3">
            <label className="text-sm font-medium">
              รหัสนักเรียน
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                className="app-input mt-2 h-14 rounded-2xl border-sky-100 bg-white text-center text-2xl font-semibold tracking-wide shadow-inner focus:border-sky-300"
                inputMode="numeric"
                autoComplete="off"
                placeholder="เช่น 12345"
              />
            </label>
            <button type="submit" disabled={busy || isPending || !examNo.trim()} className="app-button-primary h-14 w-full rounded-2xl px-6 text-base">
              <span className="whitespace-nowrap">{busy || isPending ? "กำลังตรวจ" : "ตรวจผลคะแนน"}</span>
            </button>
          </div>

          {(busy || isPending) && !error && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
              กำลังเปิดหน้าแสดงผลแบบเต็ม โปรดรอสักครู่
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-2xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
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
