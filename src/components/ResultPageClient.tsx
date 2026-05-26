"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { MissingResult, ResultContent, ResultShell, type StudentResult } from "@/components/PublicResultView";

export const studentResultSessionStorageKey = "student_result_payload_v1";
const storageMaxAgeMs = 30 * 60 * 1000;

type PublicResultSettings = {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: { name: string; classLevel: string } | null;
};

type StoredResultPayload = {
  savedAt: number;
  result: StudentResult;
};

type CurrentResultResponse =
  | { ok: true; result: StudentResult }
  | { error?: string; settings?: PublicResultSettings };

function isStoredResultPayload(value: unknown): value is StoredResultPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<StoredResultPayload>;
  return typeof payload.savedAt === "number" && Boolean(payload.result);
}

export function cacheStudentResultForPage(result: StudentResult) {
  try {
    window.sessionStorage.setItem(
      studentResultSessionStorageKey,
      JSON.stringify({ savedAt: Date.now(), result }),
    );
  } catch {
    // Session storage is a speed optimization. The signed cookie remains the source of truth.
  }
}

function readStoredResult() {
  try {
    const raw = window.sessionStorage.getItem(studentResultSessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredResultPayload(parsed)) return null;
    if (Date.now() - parsed.savedAt > storageMaxAgeMs) {
      window.sessionStorage.removeItem(studentResultSessionStorageKey);
      return null;
    }
    return parsed.result;
  } catch {
    return null;
  }
}

export function ResultPageClient() {
  const [result, setResult] = useState<StudentResult | null>(null);
  const [settings, setSettings] = useState<PublicResultSettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const stored = readStoredResult();
    if (stored) {
      queueMicrotask(() => {
        if (active) setResult(stored);
      });
    }

    async function loadCurrentResult() {
      try {
        const response = await fetch("/api/check-result/current", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json()) as CurrentResultResponse;
        if (!active) return;

        if ("ok" in data && data.ok) {
          setResult(data.result);
          cacheStudentResultForPage(data.result);
          setError("");
          return;
        }

        if (!("ok" in data)) {
          if (data.settings) setSettings(data.settings);
          if (!stored) {
            setError(data.error ?? "ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง");
          }
        }
      } catch {
        if (!active || stored) return;
        setError("เปิดผลคะแนนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCurrentResult();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ResultShell>
      {result ? (
        <>
          <ResultContent result={result} />
          <AppFooter className="mt-auto" />
        </>
      ) : error ? (
        <>
          <MissingResult
            schoolName={settings?.schoolName ?? "ระบบประกาศผลสอบ"}
            logoUrl={settings?.logoUrl}
            activeExam={settings?.activeExam}
            message={error}
          />
          <AppFooter className="mt-auto" />
        </>
      ) : (
        <>
          <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
              <Loader2 size={18} className="shrink-0 animate-spin" />
              {loading ? "กำลังเปิดผลคะแนน" : "กำลังเตรียมหน้าแสดงผล"}
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
        </>
      )}
    </ResultShell>
  );
}
