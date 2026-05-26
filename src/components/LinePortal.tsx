"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, Search, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

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
};
type ActiveExamInfo = {
  name: string;
  classLevel: string;
  status: "DRAFT" | "PUBLISHED";
};

declare global {
  interface Window {
    liff?: {
      init: (options: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<LineProfile>;
      closeWindow: () => void;
    };
  }
}

export function LinePortal({ activeExam }: { activeExam?: ActiveExamInfo | null }) {
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [examNo, setExamNo] = useState("");
  const [message, setMessage] = useState("กำลังเชื่อมต่อ LINE...");
  const [binding, setBinding] = useState<LineBindingInfo | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const closeLiffWindow = useCallback(() => {
    setTimeout(() => {
      try {
        window.liff?.closeWindow();
      } catch {
        setMessage("ผูกบัญชีสำเร็จ กรุณาปิดหน้าต่างนี้แล้วกดปุ่มเช็คผลใน LINE");
      }
    }, 700);
  }, []);

  const loadBindingStatus = useCallback(async (lineUserId: string, displayName?: string) => {
    const response = await fetch("/api/line/binding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId }),
    });
    const data = await response.json();

    if (response.ok) {
      setBinding(data);
      setShowChangeForm(false);
      setMessage(`ผูกบัญชีกับ ${data.student.name} (${data.student.examNo}) แล้ว`);
      return;
    }

    setBinding(null);
    setShowChangeForm(true);
    setMessage(`พร้อมเชื่อมต่อบัญชี${displayName ? `: ${displayName}` : ""}`);
  }, []);

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
          window.liff?.login();
          return;
        }
        const loadedProfile = await window.liff.getProfile();
        setProfile(loadedProfile);
        await loadBindingStatus(loadedProfile.userId, loadedProfile.displayName);
      } catch {
        setMessage("เปิด LIFF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [loadBindingStatus]);

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
    setMessage(`ผูกบัญชีกับ ${data.student.name} (${data.student.examNo}) แล้ว กำลังกลับไป LINE`);
    closeLiffWindow();
  }

  const showForm = !binding || showChangeForm;

  return (
    <main className="min-h-screen bg-[#f8fbff] text-[var(--text-main)]">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">ระบบประกาศผลสอบ</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">เชื่อมต่อบัญชี LINE</h1>
          {activeExam && (
            <div className="mx-auto mt-3 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              <span className="max-w-full truncate">{activeExam.name}</span>
              <span className="text-slate-400">·</span>
              <span>ระดับชั้น {activeExam.classLevel}</span>
              <span className={activeExam.status === "PUBLISHED" ? "text-emerald-700" : "text-slate-500"}>
                {activeExam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"}
              </span>
            </div>
          )}
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
            กรอกรหัสนักเรียนเพื่อผูกกับบัญชี LINE แล้วกลับไปกดดูผลคะแนนในแชท
          </p>
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
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 py-3 font-semibold text-[var(--primary-blue-strong)] transition hover:border-sky-300 hover:bg-sky-50"
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
