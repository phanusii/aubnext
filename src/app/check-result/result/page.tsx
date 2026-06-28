import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { ResultPageClient } from "@/components/ResultPageClient";
import { ResultShell, type StudentResult } from "@/components/PublicResultView";
import { getCachedPublishedStudentResultSession } from "@/lib/public-student-result-cache";
import { getLineLiffUrl } from "@/lib/line-rich-menu";
import {
  readStudentIdentityCookie,
  readStudentResultCookie,
  studentIdentityCookieName,
  studentResultCookieName,
} from "@/lib/security";

// preferredRegion = iad1 มีผลตอน resolver รันจริง (อ่าน cookie + lookup ผล) ให้ query ไม่ข้าม region
export const preferredRegion = "iad1";

// โครงโหลด = static shell ที่ serve จาก CDN ทันที ระหว่างที่ resolver กำลังอ่าน cookie + ผลคะแนน stream เข้ามา
function ResultLoadingShell() {
  return (
    <ResultShell>
      <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
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
      </div>
      <AppFooter className="mt-auto" />
    </ResultShell>
  );
}

async function ResultResolver({ lineResultToken }: { lineResultToken?: string }) {
  // อ่านผลจาก cookie ฝั่ง server (เคส refresh / เปิดลิงก์ใหม่ / คนละ tab ที่ไม่มี sessionStorage)
  // คั่นด้วย <Suspense> เพราะ cookies() เป็น dynamic API — cacheComponents บังคับให้อยู่ใต้ boundary
  // flow ผ่าน LINE token (ยังไม่มี cookie) จะได้ initialResult = null แล้วให้ client แลก token ตามเดิม
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);

  let initialResult: StudentResult | null = null;
  if (lookup) {
    const session = await getCachedPublishedStudentResultSession(lookup);
    if (session && !("cacheMissing" in session)) {
      initialResult = session.result as StudentResult;
    }
  }

  // ไม่มีผลจาก cookie สั้น + ไม่ได้มากับ token → ลอง cookie ระบุตัวแบบยาว (examNo) เปิดผลตรง ๆ
  // เส้นทางเมนู LINE "เช็คผลผ่านเว็บ" (ลิงก์ตรง) จะวิ่งทางนี้ — เร็ว ไม่ต้องผ่าน LIFF/การ์ด
  if (!initialResult && !lineResultToken) {
    const identityExamNo = readStudentIdentityCookie(cookieStore.get(studentIdentityCookieName())?.value);
    if (identityExamNo) {
      const session = await getCachedPublishedStudentResultSession(identityExamNo);
      if (session && !("cacheMissing" in session)) {
        initialResult = session.result as StudentResult;
      }
    }
  }

  // เปิดจาก LINE ครั้งแรก (ยังไม่มี cookie เลย) → เด้งไป LIFF เพื่อระบุตัว + ตั้ง cookie ระบุตัว
  // ครั้งต่อ ๆ ไปจะเข้าทาง cookie ด้านบนทันที (ไม่ต้องผ่าน LIFF อีก)
  if (!initialResult && !lineResultToken) {
    const ua = (await headers()).get("user-agent") ?? "";
    if (/\bLine\//i.test(ua)) {
      redirect(getLineLiffUrl({ next: "result" }));
    }
  }

  return <ResultPageClient initialResult={initialResult} />;
}

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ lineResultToken?: string }>;
}) {
  const { lineResultToken } = await searchParams;
  return (
    <Suspense fallback={<ResultLoadingShell />}>
      <ResultResolver lineResultToken={lineResultToken} />
    </Suspense>
  );
}
