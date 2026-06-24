import { Suspense } from "react";
import { connection } from "next/server";
import { Loader2 } from "lucide-react";
import { LinePortal } from "@/components/LinePortal";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";

// preferredRegion = sin1 มีผลตอน fetch settings จริง (revalidate / cache miss) ให้ query ไม่ข้าม region
export const preferredRegion = "sin1";

async function LinePortalWithSettings() {
  // dynamic hole: render ตอน request (ไม่แตะ DB ตอน build) แต่ data อ่านจาก use cache
  await connection();
  const settings = await getCachedPublicResultSettings();
  return (
    <LinePortal
      schoolName={settings.schoolName}
      logoUrl={settings.logoUrl}
      activeExam={settings.activeExam
        ? {
            name: settings.activeExam.name,
            classLevel: settings.activeExam.classLevel,
            status: settings.activeExam.status,
          }
        : null}
    />
  );
}

// static shell ระหว่างที่ settings ของ portal stream เข้ามา
function LinePortalFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(180deg,#f0f9ff_0%,#fff7fb_55%,#ffffff_100%)] p-5 text-[var(--text-main)]">
      <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-white px-5 py-4 text-sm font-semibold text-sky-800 shadow-[0_18px_55px_rgba(14,165,233,0.10)]">
        <Loader2 size={18} className="shrink-0 animate-spin" />
        กำลังเชื่อมต่อ LINE...
      </div>
    </main>
  );
}

export default function LinePage() {
  return (
    <Suspense fallback={<LinePortalFallback />}>
      <LinePortalWithSettings />
    </Suspense>
  );
}
