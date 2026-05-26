import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Award, BarChart3, ChevronLeft, Medal, School, ShieldCheck, Trophy } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";
import { checkPrivateResult } from "@/lib/repository";
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

function percent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

function rankPercent(rank: number, count: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(count) || count <= 1) return 100;
  return Math.max(5, Math.min(100, ((count - rank + 1) / count) * 100));
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
  const result = lookup ? await checkPrivateResult(lookup) : null;

  if (!result) {
    const settings = await getCachedPublicResultSettings();
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
        <div className="flex gap-4">
          {result.school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.school.logoUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-[var(--border-soft)] md:size-20" />
          ) : (
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)] md:size-20">
              <School size={34} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-tight text-[var(--primary-blue-strong)] md:text-2xl">{result.school.schoolName}</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-4xl">{result.exam.name}</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              ระดับชั้น {result.exam.classLevel}
              {publishedAt ? ` · ประกาศวันที่ ${publishedAt}` : ""}
            </p>
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

        <section className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={18} />
            <h3 className="text-lg font-semibold">กราฟสถิติรายวิชา</h3>
          </div>
          <SubjectComparisonCharts subjects={result.statistics.subjects} />
        </section>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric icon={<Award size={18} />} label="คะแนนรวม" value={formatScore(result.result.totalScore)} />
          <Metric icon={<Medal size={18} />} label={rankLabel} value={String(result.result.rank)} />
          <Metric icon={<ShieldCheck size={18} />} label="สถานะ" value={statusText[result.result.status]} />
        </div>

        <section className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={18} />
            <h3 className="text-lg font-semibold">สถิติเปรียบเทียบคะแนนรวม</h3>
          </div>
          <TotalComparisonChart
            score={result.statistics.total.score}
            roomAverage={result.statistics.total.roomAverage}
            levelAverage={result.statistics.total.levelAverage}
            roomRank={result.statistics.total.roomRank}
            levelRank={result.statistics.total.levelRank}
            roomCount={result.statistics.total.roomCount}
            levelCount={result.statistics.total.levelCount}
          />
        </section>

        <section className="mt-5 rounded-2xl bg-[#f1f8ff] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--text-main)]">เหตุผลการคัดเลือก</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{result.result.reason}</p>
        </section>

        {result.result.status === "PASSED" && (
          <section className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
              <BadgeCheckIcon />
              แจ้งสำหรับผู้ผ่านการคัดเลือก
            </div>
            <p className="mt-2 text-lg font-semibold text-[var(--text-main)]">{result.exam.passTitle || "ผ่านการคัดเลือก"}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]">
              {result.exam.passInstructions || "กรุณาติดตามรายละเอียดและขั้นตอนถัดไปจากประกาศของโรงเรียน"}
            </p>
          </section>
        )}
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

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fbfdff] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        {icon ? icon : null}
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function TotalComparisonChart({
  score,
  roomAverage,
  levelAverage,
  roomRank,
  levelRank,
  roomCount,
  levelCount,
}: {
  score: number;
  roomAverage: number;
  levelAverage: number;
  roomRank: number;
  levelRank: number;
  roomCount: number;
  levelCount: number;
}) {
  const maxScore = Math.max(score, roomAverage, levelAverage, 1);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#ffffff,#f0f9ff)] p-4 shadow-[0_10px_30px_rgba(14,165,233,0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sky-900">คะแนนรวมเทียบค่าเฉลี่ย</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">เปรียบเทียบคะแนนนักเรียนกับค่าเฉลี่ยห้องและทั้งชั้น</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-sky-100">
            <p className="text-xs text-sky-700">คะแนนรวม</p>
            <p className="text-2xl font-semibold text-slate-950">{formatScore(score)}</p>
          </div>
        </div>
        <div className="space-y-3">
          <ChartBar label="นักเรียน" value={score} max={maxScore} colorClass="bg-sky-500" valueClass="text-sky-700" />
          <ChartBar label="เฉลี่ยห้อง" value={roomAverage} max={maxScore} colorClass="bg-emerald-400" valueClass="text-emerald-700" />
          <ChartBar label="เฉลี่ยทั้งชั้น" value={levelAverage} max={maxScore} colorClass="bg-violet-400" valueClass="text-violet-700" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <p className="text-sm font-semibold text-slate-900">อันดับคะแนนรวม</p>
        </div>
        <div className="space-y-4">
          <RankBar label="อันดับในห้อง" rank={roomRank} count={roomCount} />
          <RankBar label="อันดับทั้งชั้น" rank={levelRank} count={levelCount} />
        </div>
      </div>
    </div>
  );
}

function SubjectComparisonCharts({
  subjects,
}: {
  subjects: StudentResult["statistics"]["subjects"];
}) {
  return (
    <div className="grid gap-4">
      {subjects.map((subject) => {
        const maxScore = Math.max(subject.score, subject.roomAverage, subject.levelAverage, 1);
        return (
          <article key={subject.id} className="rounded-2xl border border-[var(--border-soft)] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-950">{subject.name}</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">คะแนนของนักเรียนเทียบกับค่าเฉลี่ย และอันดับรายวิชา</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">ห้อง {subject.roomRank}/{subject.roomCount}</span>
                <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">ชั้น {subject.levelRank}/{subject.levelCount}</span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <ChartBar label="นักเรียน" value={subject.score} max={maxScore} colorClass="bg-sky-500" valueClass="text-sky-700" />
                <ChartBar label="เฉลี่ยห้อง" value={subject.roomAverage} max={maxScore} colorClass="bg-emerald-400" valueClass="text-emerald-700" />
                <ChartBar label="เฉลี่ยทั้งชั้น" value={subject.levelAverage} max={maxScore} colorClass="bg-violet-400" valueClass="text-violet-700" />
              </div>
              <div className="space-y-3 rounded-2xl bg-[#f8fbff] p-3">
                <RankBar label="อันดับห้อง" rank={subject.roomRank} count={subject.roomCount} compact />
                <RankBar label="อันดับทั้งชั้น" rank={subject.levelRank} count={subject.levelCount} compact />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ChartBar({
  label,
  value,
  max,
  colorClass,
  valueClass,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
  valueClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-semibold ${valueClass}`}>{formatScore(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${percent(value, max)}%` }} />
      </div>
    </div>
  );
}

function RankBar({ label, rank, count, compact = false }: { label: string; rank: number; count: number; compact?: boolean }) {
  const width = rankPercent(rank, count);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{rank}/{count}</span>
      </div>
      <div className={`${compact ? "h-2.5" : "h-3"} overflow-hidden rounded-full bg-slate-100`}>
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#0ea5e9,#0284c7)]" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">แถบยิ่งยาว หมายถึงอันดับยิ่งอยู่ด้านบน</p>
    </div>
  );
}

function BadgeCheckIcon() {
  return <ShieldCheck size={18} />;
}
