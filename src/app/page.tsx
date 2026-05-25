import { ArrowRight, FileSpreadsheet, LineChart, LockKeyhole, School } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f3ed] text-[#16211d]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-[#d7cdbb] bg-white px-3 py-2 text-sm font-medium">
              <School size={17} />
              ระบบประกาศผลสอบสำหรับโรงเรียน
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
              ประกาศผลคะแนนสอบและเช็คผลส่วนตัว
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#56665f]">
              นำคะแนนจาก Excel เข้าระบบ รวมคะแนนรายวิชา จัดอันดับตามโควตารายห้องหรือทั้งชั้น
              แล้วให้นักเรียนตรวจผลด้วยเลขประจำตัวและรหัสยืนยัน
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="/check-result"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[#1d5c4a] px-5 font-medium text-white"
              >
                เช็คผลสอบ
                <ArrowRight size={18} />
              </a>
              <a
                href="/admin"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-[#1d5c4a] px-5 font-medium text-[#1d5c4a]"
              >
                ผู้ดูแลระบบ
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-[#d7cdbb] bg-white p-5 shadow-sm">
            {[
              ["Excel import", "Template และ custom column mapping", FileSpreadsheet],
              ["Ranking rules", "คะแนนรวมและ tie-break ตามลำดับวิชา", LineChart],
              ["Private result", "เห็นเฉพาะผลของตัวเองผ่านเว็บหรือ LINE LIFF", LockKeyhole],
            ].map(([title, subtitle, Icon]) => (
              <div key={title as string} className="flex gap-4 border-b border-[#e4ddd0] py-4 first:pt-0 last:border-b-0 last:pb-0">
                <div className="grid size-11 shrink-0 place-items-center rounded-md bg-[#eef4f7] text-[#2f5d8c]">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-semibold">{title as string}</div>
                  <div className="mt-1 text-sm text-[#65736d]">{subtitle as string}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
