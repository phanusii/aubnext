"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, LockKeyhole, LogIn, Search, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { cacheStudentResultForPage, studentResultSessionStorageKey } from "@/components/ResultPageClient";
import { LogoPair } from "@/components/LogoPair";

type ActiveExam = {
  name: string;
  classLevel: string;
  status: "DRAFT" | "PUBLISHED";
  eventLogoUrl?: string | null;
  showEventLogo?: boolean;
} | null;
type Tab = "student" | "teacher";

export function HomePortal({
  schoolName,
  logoUrl,
  activeExam,
}: {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: ActiveExam;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("student");
  const [examNo, setExamNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  // แท็บครู: ล็อกอินในหน้านี้เลย
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  // แยก "ประจำปีการศึกษา ..." ขึ้นบรรทัดใหม่
  const examMarker = "ประจำปีการศึกษา";
  const examNameMain = activeExam
    ? activeExam.name.includes(examMarker)
      ? activeExam.name.slice(0, activeExam.name.indexOf(examMarker)).trim()
      : activeExam.name
    : "";
  const examNameSub =
    activeExam && activeExam.name.includes(examMarker)
      ? activeExam.name.slice(activeExam.name.indexOf(examMarker)).trim()
      : "";

  async function login() {
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        setLoginBusy(false);
        return;
      }

      // ใช้ full navigation หลัง Set-Cookie เพื่อให้ Safari/LINE/SWR cache ไม่ค้างอยู่หน้า login
      window.location.assign("/admin");
    } catch {
      setLoginBusy(false);
      setLoginError("เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
    } finally {
      window.clearTimeout(timeout);
    }
  }

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
        // ignore
      }
      setError(data.error ?? "ไม่พบผลสอบ");
      return;
    }

    if (data.result) cacheStudentResultForPage(data.result);
    setBusy(true);
    startTransition(() => router.push("/check-result/result"));
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#fdf1f8_48%,#ffffff_100%)] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-10">
        {/* โลโก้ + ชื่อโรงเรียน + ชื่อรอบสอบ */}
        <div className="text-center">
          <LogoPair
            schoolName={schoolName}
            schoolLogoUrl={logoUrl}
            eventLogoUrl={activeExam?.showEventLogo ? activeExam.eventLogoUrl : null}
            eventName={activeExam?.name}
            size="lg"
            className="mx-auto"
          />
          <h1 className="mt-4 text-xl font-bold leading-tight text-slate-950">{schoolName}</h1>

          {activeExam ? (
            <div className="mx-auto mt-4 max-w-md rounded-[1.5rem] border border-sky-100 bg-white/80 px-5 py-4 shadow-[0_12px_40px_rgba(14,165,233,0.10)] backdrop-blur">
              <p className="bg-[linear-gradient(120deg,#0284c7,#db2777)] bg-clip-text text-base font-bold leading-7 text-transparent">
                {examNameMain}
              </p>
              {examNameSub && (
                <p className="mt-1 bg-[linear-gradient(120deg,#0284c7,#db2777)] bg-clip-text text-base font-bold leading-7 text-transparent">
                  {examNameSub}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
                <span>ระดับชั้น {activeExam.classLevel}</span>
                <span className="text-slate-300">·</span>
                <span className={activeExam.status === "PUBLISHED" ? "text-emerald-600" : "text-slate-500"}>
                  {activeExam.status === "PUBLISHED" ? "ประกาศผลแล้ว" : "ยังไม่ประกาศผล"}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">ระบบประกาศผลสอบ</p>
          )}
        </div>

        {/* แท็บ นักเรียน / ครู */}
        <div className="mt-7 grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-1.5 shadow-inner ring-1 ring-sky-100">
          <button
            type="button"
            onClick={() => setTab("student")}
            className={cx(
              "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
              tab === "student"
                ? "bg-[linear-gradient(135deg,#38bdf8,#f472b6)] text-white shadow-[0_8px_22px_rgba(244,114,182,0.32)]"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <GraduationCap size={18} />
            นักเรียน
          </button>
          <button
            type="button"
            onClick={() => setTab("teacher")}
            className={cx(
              "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
              tab === "teacher"
                ? "bg-[linear-gradient(135deg,#38bdf8,#f472b6)] text-white shadow-[0_8px_22px_rgba(244,114,182,0.32)]"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <LockKeyhole size={17} />
            ครูผู้ดูแลระบบ
          </button>
        </div>

        {/* เนื้อหาแท็บ */}
        <div className="mt-5">
          {tab === "student" ? (
            <form
              className="rounded-[1.75rem] border border-sky-100 bg-white/95 p-5 shadow-[0_18px_55px_rgba(14,165,233,0.12)] backdrop-blur"
              onSubmit={(event) => {
                event.preventDefault();
                void checkResult();
              }}
            >
              <h2 className="text-center text-lg font-bold text-slate-900">เช็คผลสอบรายบุคคล</h2>
              <p className="mt-1 text-center text-sm text-slate-500">กรอกรหัสนักเรียนเพื่อดูผลคะแนนของตนเอง</p>
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                className="app-input mt-4 h-14 rounded-2xl border-sky-100 bg-white text-center text-2xl font-semibold tracking-wide shadow-inner focus:border-sky-300"
                inputMode="numeric"
                autoComplete="off"
                placeholder="เช่น 12345"
                aria-label="รหัสนักเรียน"
              />
              <button
                type="submit"
                disabled={busy || isPending || !examNo.trim()}
                className="app-button-primary mt-3 h-14 w-full rounded-2xl text-base"
              >
                <Search size={18} />
                {busy || isPending ? "กำลังตรวจ..." : "ตรวจผลคะแนน"}
              </button>

              {(busy || isPending) && !error && (
                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-800">
                  กำลังเปิดหน้าแสดงผล โปรดรอสักครู่
                </div>
              )}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
                  <XCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          ) : (
            <form
              className="rounded-[1.75rem] border border-sky-100 bg-white/95 p-5 text-center shadow-[0_18px_55px_rgba(14,165,233,0.12)] backdrop-blur"
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--blue-wash)] text-[var(--primary-blue-strong)]">
                <LockKeyhole size={26} />
              </div>
              <h2 className="mt-3 text-lg font-bold text-slate-900">เข้าสู่ระบบผู้ดูแล</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">สำหรับครูผู้ดูแลระบบ — กรอกอีเมลและรหัสผ่าน</p>
              <div className="mt-4 grid gap-3 text-left">
                <label className="text-sm font-medium">
                  อีเมล
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="app-input mt-1.5 rounded-2xl"
                    autoComplete="username"
                    placeholder="you@email.com"
                  />
                </label>
                <label className="text-sm font-medium">
                  รหัสผ่าน
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="app-input mt-1.5 rounded-2xl"
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={loginBusy || isPending || !email.trim() || !password}
                className="app-button-primary mt-4 h-14 w-full rounded-2xl text-base"
              >
                <LogIn size={18} />
                {loginBusy || isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
              {loginError && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-left text-sm text-[var(--accent-pink-strong)]">
                  <XCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}
            </form>
          )}
        </div>

        <AppFooter className="mt-auto" />
      </section>
    </main>
  );
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
