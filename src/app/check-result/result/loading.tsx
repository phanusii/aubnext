import { Loader2 } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

export default function ResultLoading() {
  return (
    <main className="min-h-screen bg-[#f7fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 md:py-10">
        <div className="mb-4 h-6 w-32 rounded-full bg-sky-100" />
        <article className="overflow-hidden rounded-[1.5rem] border border-[var(--border-soft)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <header className="border-b border-[var(--border-soft)] p-5 md:p-7">
            <div className="flex items-start gap-4">
              <div className="size-16 shrink-0 rounded-2xl bg-sky-100" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-4 w-40 rounded-full bg-sky-100" />
                <div className="h-8 w-full max-w-2xl rounded-full bg-slate-100" />
                <div className="h-4 w-48 rounded-full bg-slate-100" />
              </div>
            </div>
          </header>
          <div className="p-5 md:p-7">
            <div className="mb-6 flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
              <Loader2 size={18} className="animate-spin" />
              กำลังโหลดผลคะแนนและสถิติเปรียบเทียบ
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="h-24 rounded-2xl bg-slate-100" />
              <div className="h-24 rounded-2xl bg-slate-100" />
              <div className="h-24 rounded-2xl bg-slate-100" />
            </div>
            <div className="mt-6 h-48 rounded-2xl bg-slate-100" />
          </div>
        </article>
        <AppFooter className="mt-auto" />
      </section>
    </main>
  );
}
