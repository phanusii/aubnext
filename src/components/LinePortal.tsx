"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, School, Search, XCircle } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

type LineProfile = {
  userId: string;
  displayName?: string;
};
type PublicSettings = {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: { name: string; classLevel: string } | null;
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

export function LinePortal() {
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [examNo, setExamNo] = useState("");
  const [message, setMessage] = useState("กำลังเปิด LINE LIFF...");
  const [busy, setBusy] = useState(false);
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    schoolName: "โรงเรียนตัวอย่าง",
    logoUrl: "",
    activeExam: null,
  });

  const closeLiffWindow = useCallback(() => {
    setTimeout(() => {
      try {
        window.liff?.closeWindow();
      } catch {
        setMessage("ผูกบัญชีสำเร็จ กรุณาปิดหน้าต่างนี้แล้วกดปุ่มเช็คผลใน LINE");
      }
    }, 700);
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) =>
        setPublicSettings({
          schoolName: data.schoolName ?? "โรงเรียนตัวอย่าง",
          logoUrl: data.logoUrl ?? "",
          activeExam: data.activeExam ?? null,
        }),
      )
      .catch(() => undefined);

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
        setMessage(`สวัสดี ${loadedProfile.displayName ?? "นักเรียน"} กรุณากรอกรหัสนักเรียนเพื่อเชื่อมต่อบัญชี`);
      } catch {
        setMessage("เปิด LIFF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

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

    setMessage("ผูกบัญชีสำเร็จ กำลังปิดหน้าต่าง กรุณากดปุ่มเช็คผลอีกครั้งใน LINE");
    closeLiffWindow();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e0f2fe,#fff0f7)] text-[var(--text-main)]">
      <section className="mx-auto min-h-screen w-full max-w-3xl px-5 py-8">
        <div className="mb-5 flex items-center gap-3 rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-solid)] p-4 shadow-[var(--shadow-soft)]">
          {publicSettings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={publicSettings.logoUrl} alt="" className="size-16 rounded-2xl object-cover ring-2 ring-[var(--pink-soft)]" />
          ) : (
            <div className="grid size-16 place-items-center rounded-2xl bg-[var(--primary-blue)] text-white">
              <School size={28} />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--primary-blue-strong)]">{publicSettings.schoolName}</p>
            <h1 className="text-xl font-semibold leading-tight">{publicSettings.activeExam?.name ?? "LINE ดูผลคะแนน"}</h1>
            {publicSettings.activeExam?.classLevel && (
              <p className="text-xs text-[var(--text-muted)]">ระดับชั้น {publicSettings.activeExam.classLevel}</p>
            )}
          </div>
        </div>
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 max-w-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full" />
          </div>
          <h2 className="text-3xl font-semibold">เชื่อมต่อบัญชี LINE</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">ผูกบัญชีด้วยรหัสนักเรียน แล้วกดปุ่มเช็คผลใน LINE เพื่อรับการ์ดผลคะแนน</p>
        </div>

        <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-solid)] p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
            {message}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="text-sm font-medium">
              รหัสนักเรียน
              <input
                value={examNo}
                onChange={(event) => setExamNo(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && bindAccount()}
                className="app-input mt-1"
                inputMode="numeric"
              />
            </label>
            <button type="button" onClick={bindAccount} disabled={busy || !profile || !examNo.trim()} className="app-button-primary mt-6 md:mt-auto">
              <Search size={18} />
              ผูกบัญชี
            </button>
          </div>

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
