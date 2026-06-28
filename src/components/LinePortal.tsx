"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, Search, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { type StudentResult } from "@/components/PublicResultView";
import { cacheStudentResultForPage } from "@/components/ResultPageClient";

type LineProfile = {
  userId: string;
  displayName?: string;
};

type LineBindingInfo = {
  student: {
    examNo: string;
    name: string;
    classLevel: string;
    room: string;
  };
  exam: {
    id: string;
    name: string;
    status: string;
  };
  resultWebToken?: string;
};
type ActiveExamInfo = {
  name: string;
  classLevel: string;
  status: "DRAFT" | "PUBLISHED";
};
type LineResultResponse =
  | { ok: true; result: StudentResult }
  | { error?: string };

declare global {
  interface Window {
    liff?: {
      init: (options: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (options?: { redirectUri?: string }) => void;
      getProfile: () => Promise<LineProfile>;
      closeWindow: () => void;
    };
  }
}

export function LinePortal({
  schoolName,
  logoUrl,
  activeExam,
  directResultMode = false,
}: {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: ActiveExamInfo | null;
  directResultMode?: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [examNo, setExamNo] = useState("");
  const [message, setMessage] = useState("กำลังเชื่อมต่อ LINE...");
  const [binding, setBinding] = useState<LineBindingInfo | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allowFallbackForm, setAllowFallbackForm] = useState(false);

  const closeLiffWindow = useCallback(() => {
    setTimeout(() => {
      try {
        window.liff?.closeWindow();
      } catch {
        setMessage("ผูกบัญชีสำเร็จ กรุณาปิดหน้าต่างนี้แล้วกดปุ่มเช็คผลใน LINE");
      }
    }, 700);
  }, []);

  const loadBindingStatus = useCallback(async (lineUserId: string, displayName?: string, messageOverride?: string) => {
    const response = await fetch("/api/line/binding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId }),
    });
    const data = await response.json();

    if (response.ok) {
      setBinding(data);
      setShowChangeForm(false);
      setMessage(messageOverride ?? `ผูกบัญชีกับ ${data.student.name} (${data.student.examNo}) แล้ว`);
      return;
    }

    setBinding(null);
    setShowChangeForm(true);
    setMessage(messageOverride ?? `พร้อมเชื่อมต่อบัญชี${displayName ? `: ${displayName}` : ""}`);
  }, []);

  const openBoundResult = useCallback(async (lineUserId: string, displayName?: string) => {
    setBusy(true);
    setMessage("กำลังเปิดผลคะแนน...");
    const response = await fetch("/api/line/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId }),
    });
    const data = (await response.json()) as LineResultResponse;

    if (response.ok && "ok" in data && data.ok) {
      cacheStudentResultForPage(data.result);
      setMessage("พบผลคะแนนแล้ว กำลังเปิดหน้าแสดงผล...");
      router.replace("/check-result/result");
      return;
    }

    setBusy(false);
    setAllowFallbackForm(true);
    await loadBindingStatus(
      lineUserId,
      displayName,
      !("ok" in data) && data.error ? data.error : "ยังไม่พบผลคะแนนสำหรับบัญชี LINE นี้",
    );
  }, [loadBindingStatus, router]);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      queueMicrotask(() => setMessage("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID"));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.onload = async () => {
      try {
        await window.liff?.init({ liffId });
        if (!window.liff?.isLoggedIn()) {
          window.liff?.login({ redirectUri: window.location.href });
          return;
        }
        const loadedProfile = await window.liff.getProfile();
        setProfile(loadedProfile);
        if (directResultMode) {
          await openBoundResult(loadedProfile.userId, loadedProfile.displayName);
          return;
        }
        await loadBindingStatus(loadedProfile.userId, loadedProfile.displayName);
      } catch {
        setBusy(false);
        setMessage("เปิด LIFF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [directResultMode, loadBindingStatus, openBoundResult]);

  async function bindAccount() {
    if (!profile) return;
    setBusy(true);
    const response = await fetch("/api/line/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId: profile.userId, lineName: profile.displayName, examNo }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "ผูกบัญชีไม่สำเร็จ");
      return;
    }

    setSuccess(true);
    setBinding({ student: data.student, exam: data.exam });
    setShowChangeForm(false);
    setMessage(
      data.resultPushed
        ? `ผูกบัญชีกับ ${data.student.name} แล้ว ส่งผลคะแนนเข้าแชท LINE แล้ว กำลังกลับไป...`
        : `ผูกบัญชีกับ ${data.student.name} (${data.student.examNo}) แล้ว กำลังกลับไป LINE`,
    );
    closeLiffWindow();
  }

  const shouldOpenResultDirectly = directResultMode && !allowFallbackForm;
  const showForm = (!binding || showChangeForm) && !shouldOpenResultDirectly;
  const title = shouldOpenResultDirectly ? "กำลังเปิดผลคะแนน" : binding && !showChangeForm ? "เชื่อมต่อบัญชี LINE" : "กรอกรหัสนักเรียน";
  const description = shouldOpenResultDirectly
    ? "กำลังตรวจบัญชี LINE ที่ผูกไว้เพื่อเปิดหน้าแสดงผลคะแนน"
    : binding
      ? "เปลี่ยนรหัสที่ผูกได้ โดยกรอกรหัสใหม่ด้านล่าง"
      : "รอบสอบนี้ยังไม่ได้ผูกบัญชี — กรอกรหัสนักเรียนเพื่อดูผลคะแนนในแชท LINE";

  return (
    <main className="min-h-screen bg-[#f8fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-8">
        <div className="mb-6 text-center">
          {logoUrl && (
            <div className="mx-auto mb-3 grid size-20 place-items-center overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-sky-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={schoolName} className="size-full object-cover" />
            </div>
          )}
          <p className="text-lg font-semibold leading-tight text-slate-950">{schoolName}</p>
          {activeExam && (
            <div className="mx-auto mt-4 max-w-full rounded-[1.25rem] bg-white px-4 py-3 text-center ring-1 ring-sky-100">
              <p className="line-clamp-2 text-sm font-semibold leading-6 text-sky-700">{activeExam.name}</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                <span className="text-slate-400">·</span>
                <span className="text-sky-700">ระดับชั้น {activeExam.classLevel}</span>
                <span className={activeExam.status === "PUBLISHED" ? "text-emerald-700" : "text-slate-500"}>
                  {activeExam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"}
                </span>
              </div>
            </div>
          )}
          <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        </div>

        <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-[#f7fbff] px-4 py-3 text-sm text-[var(--text-muted)]">
            {busy ? (
              <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[var(--primary-blue-strong)]" />
            ) : success || (binding && !showChangeForm) ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <Link2 size={18} className="mt-0.5 shrink-0 text-[var(--primary-blue-strong)]" />
            )}
            <span className={success ? "font-semibold text-emerald-700" : ""}>{message}</span>
          </div>

          {binding && !showChangeForm && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">ผูกบัญชีแล้ว</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">{binding.student.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                รหัส {binding.student.examNo} · {binding.student.classLevel}/{binding.student.room}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">{binding.exam.name}</p>
              {binding.exam.status === "PUBLISHED" && binding.resultWebToken && (
                <a
                  href={`/line/result-web?token=${encodeURIComponent(binding.resultWebToken)}`}
                  className="app-button-primary mt-4 w-full"
                >
                  <Search size={18} />
                  เปิดผลคะแนนแบบเต็มหน้าเว็บ
                </a>
              )}
              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 py-3 font-semibold text-[var(--primary-blue-strong)] transition hover:border-sky-300 hover:bg-sky-50"
                onClick={() => {
                  setExamNo("");
                  setSuccess(false);
                  setShowChangeForm(true);
                  setMessage("กรอกรหัสนักเรียนใหม่เพื่อเปลี่ยนบัญชีที่ผูกกับ LINE นี้");
                }}
              >
                <Link2 size={18} />
                เปลี่ยนบัญชี
              </button>
            </div>
          )}

          {showForm && (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void bindAccount();
              }}
            >
              <label className="text-sm font-medium">
                รหัสนักเรียน
                <input
                  value={examNo}
                  onChange={(event) => setExamNo(event.target.value)}
                  className="app-input mt-2 text-lg"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <button type="submit" disabled={busy || !profile || !examNo.trim() || success} className="app-button-primary w-full">
                <Search size={18} />
                {binding ? "ยืนยันเปลี่ยนบัญชี" : "เชื่อมต่อบัญชี"}
              </button>
            </form>
          )}

          {!profile && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>กรุณาเปิดหน้านี้ผ่าน LINE หรือรอ LIFF โหลดให้เสร็จ</span>
            </div>
          )}
        </div>

        <AppFooter />
      </section>
    </main>
  );
}
