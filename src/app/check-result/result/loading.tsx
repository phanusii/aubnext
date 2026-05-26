import { Loader2 } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

export default function ResultLoading() {
  return (
    <main className="min-h-screen bg-[#f7fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-8">
        <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
            <Loader2 size={18} className="shrink-0 animate-spin" />
            กำลังเปิดผลคะแนน
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-5 w-2/3 rounded-full bg-slate-100" />
            <div className="h-16 rounded-2xl bg-slate-100" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-14 rounded-2xl bg-slate-100" />
              <div className="h-14 rounded-2xl bg-slate-100" />
              <div className="h-14 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </article>
        <AppFooter className="mt-auto" />
      </section>
    </main>
  );
}
