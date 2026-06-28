import { Suspense } from "react";
import { connection } from "next/server";
import { Loader2 } from "lucide-react";
import { HomePortal } from "@/components/HomePortal";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";

// preferredRegion = iad1 มีผลตอน fetch settings จริง (revalidate / cache miss) ให้ query ไม่ข้าม region
export const preferredRegion = "iad1";

async function HomeWithSettings() {
  // dynamic hole: render ตอน request (ไม่แตะ DB ตอน build) — data อ่านจาก use cache (cached ข้าม request)
  await connection();
  const settings = await getCachedPublicResultSettings();
  return (
    <HomePortal
      schoolName={settings.schoolName}
      logoUrl={settings.logoUrl}
      activeExam={
        settings.activeExam
          ? {
              name: settings.activeExam.name,
              classLevel: settings.activeExam.classLevel,
              status: settings.activeExam.status,
            }
          : null
      }
    />
  );
}

function HomeFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(180deg,#eef6ff_0%,#fdf1f8_48%,#ffffff_100%)] p-5 text-[var(--text-main)]">
      <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-white px-5 py-4 text-sm font-semibold text-sky-800 shadow-[0_18px_55px_rgba(14,165,233,0.10)]">
        <Loader2 size={18} className="shrink-0 animate-spin" />
        กำลังโหลด...
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeWithSettings />
    </Suspense>
  );
}
