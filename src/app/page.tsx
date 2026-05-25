import { ArrowRight, BookOpen, FileSpreadsheet, LineChart, LockKeyhole, School, Sparkles } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--primary-blue-strong)] shadow-[var(--shadow-soft)]">
              <Sparkles size={17} />
              ระบบประกาศผลสอบสำหรับโรงเรียน
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              ประกาศผลสอบสวยทันสมัย เช็คคะแนนได้ส่วนตัว
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
              สร้างรอบสอบ ห้องเรียน วิชาสอบ นำเข้ารายชื่อพร้อมคะแนนทีละห้อง และประกาศผลแบบทั้งชั้นหรือรายห้อง
              พร้อมให้นักเรียนเช็คผลด้วยรหัสนักเรียน
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/check-result" className="app-button-primary">
                เช็คผลสอบ
                <ArrowRight size={18} />
              </a>
              <a href="/admin" className="app-button-secondary">
                ผู้ดูแลระบบ
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            {[
              ["Classrooms", "สร้างชั้นเรียน ห้องเรียน และโควตาผู้ผ่าน", School],
              ["Subjects", "ตั้งชื่อวิชา คะแนนเต็ม และลำดับ tie-break", BookOpen],
              ["Import", "อัปโหลด Excel/CSV หรือวางข้อมูลจากเซลล์", FileSpreadsheet],
              ["Ranking", "เรียงคะแนนทั้งชั้นหรือแยกห้องอย่างชัดเจน", LineChart],
              ["Private result", "นักเรียนเห็นผลเฉพาะของตัวเอง", LockKeyhole],
            ].map(([title, subtitle, Icon]) => (
              <div key={title as string} className="flex gap-4 border-b border-[var(--border-soft)] py-4 first:pt-0 last:border-b-0 last:pb-0">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--pink-wash)] text-[var(--accent-pink-strong)]">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-semibold">{title as string}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{subtitle as string}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <AppFooter />
      </section>
    </main>
  );
}
