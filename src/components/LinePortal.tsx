"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, Search, XCircle } from "lucide-react";
import { StudentResultCard, type StudentResultResponse } from "@/components/StudentResultCard";

type LineProfile = {
  userId: string;
  displayName?: string;
};

declare global {
  interface Window {
    liff?: {
      init: (options: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<LineProfile>;
    };
  }
}

export function LinePortal() {
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [examNo, setExamNo] = useState("");
  const [result, setResult] = useState<StudentResultResponse | null>(null);
  const [message, setMessage] = useState("กำลังเปิด LINE LIFF...");
  const [busy, setBusy] = useState(false);

  const loadBoundResult = useCallback(async (lineUserId: string) => {
    const response = await fetch("/api/line/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId }),
    });
    const data = await response.json();
    if (response.ok) {
      setResult(data);
      setMessage("พบผลคะแนนที่ผูกไว้แล้ว");
    } else {
      setResult(null);
      setMessage(data.error ?? "กรอกรหัสนักเรียนเพื่อผูกบัญชี");
    }
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
        setMessage(`สวัสดี ${loadedProfile.displayName ?? "นักเรียน"}`);
        await loadBoundResult(loadedProfile.userId);
      } catch {
        setMessage("เปิด LIFF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [loadBoundResult]);

  async function bindAccount() {
    if (!profile) return;
    setBusy(true);
    setResult(null);
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

    if (data.result) {
      setResult(data.result);
      setMessage("ผูกบัญชีแล้ว และพบผลคะแนน");
    } else {
      setMessage("ผูกบัญชีแล้ว รอประกาศผลจากโรงเรียน");
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e0f2fe,#fff0f7)] text-[var(--text-main)]">
      <section className="mx-auto min-h-screen w-full max-w-3xl px-5 py-8">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 max-w-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/result-mascot.png" alt="การ์ตูนนักเรียนถือถ้วยรางวัล" className="h-auto w-full" />
          </div>
          <h1 className="text-3xl font-semibold">LINE ดูผลคะแนน</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">ผูกบัญชีด้วยรหัสนักเรียน แล้วกลับมาดูผลได้ทันทีจากเมนู LINE</p>
        </div>

        <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-solid)] p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
            {message}
          </div>

          {!result && (
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
          )}

          {!profile && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] p-3 text-sm text-[var(--accent-pink-strong)]">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <span>กรุณาเปิดหน้านี้ผ่าน LINE หรือรอ LIFF โหลดให้เสร็จ</span>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-5">
            <StudentResultCard result={result} />
          </div>
        )}
      </section>
    </main>
  );
}
