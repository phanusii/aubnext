import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Award, ChevronLeft, Medal, School, ShieldCheck } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { checkPrivateResult, getPublicResultSettings } from "@/lib/repository";
import { readStudentResultCookie, studentResultCookieName } from "@/lib/security";

type StudentResult = NonNullable<Awaited<ReturnType<typeof checkPrivateResult>>>;

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบ",
};

function statusClass(status: StudentResult["result"]["status"]) {
  if (status === "PASSED") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (status === "REVIEW") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPublishedAt(value: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ResultPage() {
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);
  const result = lookup ? await checkPrivateResult({ examNo: lookup.examNo }) : null;

  if (!result) {
    const settings = await getPublicResultSettings();
    return (
      <main className="min-h-screen bg-[#f7fbff] text-[var(--text-main)]">
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 md:py-10">
          <Link href="/check-result" className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--primary-blue-strong)]">
            <ChevronLeft size={18} />
            กลับไปกรอกรหัส
          </Link>

          <MissingResult
            schoolName={settings.schoolName}
            logoUrl={settings.logoUrl}
            activeExam={settings.activeExam}
          />

          <AppFooter className="mt-auto" />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 md:py-10">
        <Link href="/check-result" className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--primary-blue-strong)]">
          <ChevronLeft size={18} />
          กลับไปกรอกรหัส
        </Link>

        <ResultContent result={result} />

        <AppFooter className="mt-auto" />
      </section>
    </main>
  );
}

function ResultContent({ result }: { result: StudentResult }) {
  const rankLabel = result.exam.selectionMode === "PER_ROOM" ? "อันดับในห้อง" : "อันดับทั้งชั้น";
  const publishedAt = formatPublishedAt(result.exam.publishedAt);

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[var(--border-soft)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <header className="border-b border-[var(--border-soft)] bg-white p-5 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            {result.school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.school.logoUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-[var(--border-soft)]" />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)]">
                <School size={30} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{result.school.schoolName}</p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-4xl">{result.exam.name}</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                ระดับชั้น {result.exam.classLevel}
                {publishedAt ? ` · ประกาศวันที่ ${publishedAt}` : ""}
              </p>
            </div>
          </div>
          <div className="mx-auto w-24 shrink-0 md:mx-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full opacity-90" />
          </div>
        </div>
      </header>

      <div className="p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)]">ผู้เข้าสอบ</p>
            <h2 className="mt-1 text-3xl font-semibold leading-tight">{result.student.name}</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              รหัส {result.student.examNo} · {result.student.classLevel}/{result.student.room}
            </p>
          </div>
          <span className={`inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold ring-1 ${statusClass(result.result.status)}`}>
            {statusText[result.result.status]}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric icon={<Award size={18} />} label="คะแนนรวม" value={formatScore(result.result.totalScore)} />
          <Metric icon={<Medal size={18} />} label={rankLabel} value={String(result.result.rank)} />
          <Metric icon={<ShieldCheck size={18} />} label="สถานะ" value={statusText[result.result.status]} />
        </div>

        <section className="mt-7">
          <h3 className="text-lg font-semibold">คะแนนรายวิชา</h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border-soft)]">
            {Object.entries(result.result.scoreBreakdown).map(([subject, score]) => (
              <div key={subject} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--border-soft)] px-4 py-3 last:border-b-0">
                <span>{subject}</span>
                <span className="font-semibold">{formatScore(score)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl bg-[#f1f8ff] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--text-main)]">เหตุผลการคัดเลือก</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{result.result.reason}</p>
        </section>
      </div>
    </article>
  );
}

function MissingResult({
  schoolName,
  logoUrl,
  activeExam,
}: {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: { name: string; classLevel: string } | null;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-6 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mx-auto mb-4 grid size-16 place-items-center overflow-hidden rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          <School size={30} />
        )}
      </div>
      <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{schoolName}</p>
      <h1 className="mx-auto mt-2 max-w-2xl text-2xl font-semibold leading-tight md:text-3xl">
        {activeExam?.name ?? "ประกาศผลสอบ"}
      </h1>
      {activeExam?.classLevel && <p className="mt-2 text-sm text-[var(--text-muted)]">ระดับชั้น {activeExam.classLevel}</p>}
      <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[var(--text-muted)]">
        ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง
      </p>
      <Link href="/check-result" className="app-button-primary mt-5">
        กรอกรหัสนักเรียน
      </Link>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fbfdff] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
    </div>
  );
}
