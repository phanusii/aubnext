"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import {
  clearScoreDraft,
  countScoreDraftChanges,
  readScoreDraft,
  type ScoreDraftAbsentEdits,
  type ScoreDraftEdits,
  writeScoreDraft,
} from "@/lib/score-draft-storage";

type Subject = { id: string; name: string; maxScore: number | null };
type Student = { id: string; examNo: string; name: string; room: string; absent: boolean; scores: Record<string, number> };
type Sheet = { subjects: Subject[]; students: Student[] };

// แก้คะแนนเก็บเป็น string ต่อ (studentId -> subjectId -> ค่าที่พิมพ์)
type Edits = ScoreDraftEdits;
type SyncState = "idle" | "pending" | "syncing" | "saved" | "offline" | "error";

function isFilled(student: Student, subjects: Subject[], edits: Edits) {
  return subjects.every((subject) => {
    const edited = edits[student.id]?.[subject.id];
    const value = edited !== undefined ? edited : student.scores[subject.id];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

// สร้าง payload อัปเดตจากค่าที่แก้ค้างอยู่ (คะแนน + ติ๊กขาดสอบ)
function buildUpdates(edits: Edits, absentEdits: Record<string, boolean>) {
  const studentIds = new Set([...Object.keys(edits), ...Object.keys(absentEdits)]);
  return [...studentIds].map((studentId) => ({
    studentId,
    scores: Object.fromEntries(
      Object.entries(edits[studentId] ?? {}).map(([subjectId, raw]) => [subjectId, raw.trim() === "" ? null : Number(raw)]),
    ),
    ...(studentId in absentEdits ? { absent: absentEdits[studentId] } : {}),
  }));
}

function draftSignature(edits: Edits, absentEdits: ScoreDraftAbsentEdits) {
  const sortedEdits = Object.fromEntries(
    Object.entries(edits)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([studentId, scores]) => [
        studentId,
        Object.fromEntries(Object.entries(scores).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  const sortedAbsent = Object.fromEntries(Object.entries(absentEdits).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ edits: sortedEdits, absentEdits: sortedAbsent });
}

export function ScoreEntryCard({ examId, classLevel, onSaved }: { examId: string; classLevel: string; onSaved?: () => void }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [room, setRoom] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [syncState, setSyncState] = useState<SyncState>("idle");
  // overlay การติ๊ก "ไม่ได้เข้าสอบ" ที่ยังไม่บันทึก (studentId -> absent)
  const [absentEdits, setAbsentEdits] = useState<ScoreDraftAbsentEdits>({});
  // เก็บค่าที่แก้ค้างล่าสุดไว้ใน ref เพื่อให้ auto-save/flush อ่านค่าปัจจุบันเสมอ
  const pendingRef = useRef<{ edits: Edits; absentEdits: ScoreDraftAbsentEdits }>({ edits, absentEdits });
  const failedSignatureRef = useRef("");
  useEffect(() => {
    pendingRef.current = { edits, absentEdits };
  }, [edits, absentEdits]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const draft = readScoreDraft(examId);
      if (draft) {
        setEdits(draft.edits);
        setAbsentEdits(draft.absentEdits);
        setSyncState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "pending");
        setMessage(`พบคะแนนที่ยังไม่ได้บันทึก ${countScoreDraftChanges(draft)} รายการ ระบบจะส่งให้อัตโนมัติเมื่อพร้อม`);
      }
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!draftReady) return;
    if (Object.keys(edits).length === 0 && Object.keys(absentEdits).length === 0) {
      clearScoreDraft(examId);
      return;
    }
    writeScoreDraft(examId, edits, absentEdits);
  }, [absentEdits, draftReady, edits, examId]);

  function isAbsent(student: Student) {
    return absentEdits[student.id] ?? student.absent;
  }
  function toggleAbsent(student: Student) {
    failedSignatureRef.current = "";
    setSyncState(isOnline ? "pending" : "offline");
    setAbsentEdits((current) => ({ ...current, [student.id]: !isAbsent(student) }));
  }

  async function deleteStudentRow(student: Student) {
    if (!window.confirm(`ลบนักเรียน "${student.name}" (${student.examNo}) ออกจากรอบสอบ?\nคะแนนและผลของคนนี้จะถูกลบด้วย — กู้คืนไม่ได้`)) return;
    setDeletingId(student.id);
    try {
      const res = await fetch(`/api/exams/${examId}/students/${student.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error ?? "ลบนักเรียนไม่สำเร็จ");
        return;
      }
      setSheet((current) => (current ? { ...current, students: current.students.filter((item) => item.id !== student.id) } : current));
      setMessage(`ลบ ${student.name} แล้ว — อย่าลืมกด "คำนวณ"/"ประกาศผล" ใหม่เพื่ออัปเดตอันดับ`);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    // โหลดครั้งเดียวต่อ examId — parent ใส่ key={examId} ให้ remount เมื่อเปลี่ยนรอบสอบ (loading เริ่ม true เอง)
    let active = true;
    fetch(`/api/exams/${examId}/scores`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data?.subjects) setSheet({ subjects: data.subjects, students: data.students });
        else setMessage(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      })
      .catch(() => active && setMessage("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [examId]);

  const rooms = useMemo(() => {
    if (!sheet) return [];
    return [...new Set(sheet.students.map((student) => student.room))].sort((a, b) => a.localeCompare(b, "th"));
  }, [sheet]);

  const visibleStudents = useMemo(() => {
    if (!sheet) return [];
    return room === "ALL" ? sheet.students : sheet.students.filter((student) => student.room === room);
  }, [sheet, room]);

  const filledCount = useMemo(
    () => (sheet ? visibleStudents.filter((student) => isAbsent(student) || isFilled(student, sheet.subjects, edits)).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, visibleStudents, edits, absentEdits],
  );

  function cellValue(student: Student, subjectId: string) {
    const edited = edits[student.id]?.[subjectId];
    if (edited !== undefined) return edited;
    const value = student.scores[subjectId];
    return value === undefined || value === null ? "" : String(value);
  }

  function rowTotal(student: Student) {
    if (!sheet) return 0;
    return sheet.subjects.reduce((sum, subject) => {
      const value = Number(cellValue(student, subject.id));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function setCell(studentId: string, subjectId: string, value: string) {
    failedSignatureRef.current = "";
    setSyncState(isOnline ? "pending" : "offline");
    setEdits((current) => ({ ...current, [studentId]: { ...current[studentId], [subjectId]: value } }));
  }

  const performSave = useCallback(async (options?: { force?: boolean }) => {
    const { edits: e, absentEdits: a } = pendingRef.current;
    if (Object.keys(e).length === 0 && Object.keys(a).length === 0) return;
    const signature = draftSignature(e, a);
    if (!options?.force && failedSignatureRef.current === signature) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      setSyncState("offline");
      setMessage("ยังไม่ได้บันทึก เพราะอินเทอร์เน็ตไม่พร้อม ระบบเก็บคะแนนไว้ในเครื่องและจะส่งให้เมื่อออนไลน์");
      return;
    }
    setSaving(true);
    setSyncState("syncing");
    setMessage("");
    try {
      const response = await fetch(`/api/exams/${examId}/scores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: buildUpdates(e, a) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        failedSignatureRef.current = signature;
        setSyncState("error");
        setMessage(data?.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      failedSignatureRef.current = "";
      // ใส่ค่าที่บันทึกแล้วลง sheet
      setSheet((current) => {
        if (!current) return current;
        return {
          ...current,
          students: current.students.map((student) => {
            const studentEdits = e[student.id];
            const absentChanged = student.id in a;
            if (!studentEdits && !absentChanged) return student;
            const scores = { ...student.scores };
            for (const [subjectId, raw] of Object.entries(studentEdits ?? {})) {
              if (raw.trim() === "") delete scores[subjectId];
              else scores[subjectId] = Number(raw);
            }
            return { ...student, scores, absent: absentChanged ? a[student.id] : student.absent };
          }),
        };
      });
      // ล้างเฉพาะค่าที่บันทึกไปแล้ว — คงค่าที่พิมพ์เพิ่มระหว่างกำลังบันทึก
      setEdits((current) => {
        const next: Edits = { ...current };
        for (const sid of Object.keys(e)) {
          const row = next[sid];
          if (!row) continue;
          const remaining = { ...row };
          for (const [subId, val] of Object.entries(e[sid])) {
            if (remaining[subId] === val) delete remaining[subId];
          }
          if (Object.keys(remaining).length === 0) delete next[sid];
          else next[sid] = remaining;
        }
        return next;
      });
      setAbsentEdits((current) => {
        const next = { ...current };
        for (const [sid, val] of Object.entries(a)) {
          if (next[sid] === val) delete next[sid];
        }
        return next;
      });
      setSyncState("saved");
      onSaved?.();
    } catch {
      failedSignatureRef.current = signature;
      setSyncState("offline");
      setMessage("ยังไม่ได้บันทึกคะแนนล่าสุด ระบบเก็บไว้ในเครื่องแล้ว และจะส่งซ้ำเมื่ออินเทอร์เน็ตพร้อม");
    } finally {
      setSaving(false);
    }
  }, [examId, onSaved]);

  // บันทึกอัตโนมัติแบบหน่วงเวลา ~0.9 วิ หลังหยุดพิมพ์/ติ๊ก
  useEffect(() => {
    const hasPending = Object.keys(edits).length > 0 || Object.keys(absentEdits).length > 0;
    if (!hasPending || saving) return;
    const signature = draftSignature(edits, absentEdits);
    if (failedSignatureRef.current === signature) return;
    const timer = setTimeout(() => void performSave(), 900);
    return () => clearTimeout(timer);
  }, [edits, absentEdits, saving, performSave]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      failedSignatureRef.current = "";
      const { edits: e, absentEdits: a } = pendingRef.current;
      if (Object.keys(e).length > 0 || Object.keys(a).length > 0) {
        void performSave({ force: true });
      }
    }
    function handleOffline() {
      setIsOnline(false);
      const { edits: e, absentEdits: a } = pendingRef.current;
      if (Object.keys(e).length > 0 || Object.keys(a).length > 0) setSyncState("offline");
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [performSave]);

  useEffect(() => {
    const { edits: e, absentEdits: a } = pendingRef.current;
    const hasQueuedChanges = Object.keys(e).length > 0 || Object.keys(a).length > 0;
    if (!hasQueuedChanges || saving || !isOnline || syncState !== "offline") return;
    const timer = setTimeout(() => {
      failedSignatureRef.current = "";
      void performSave({ force: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [isOnline, performSave, saving, syncState]);

  // กันข้อมูลหายตอนสลับแท็บ/ปิดหน้า: ส่งค่าที่ค้างแบบ keepalive ให้ส่งจบแม้ component ถูก unmount
  useEffect(() => {
    return () => {
      const { edits: e, absentEdits: a } = pendingRef.current;
      if (Object.keys(e).length === 0 && Object.keys(a).length === 0) return;
      fetch(`/api/exams/${examId}/scores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: buildUpdates(e, a) }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [examId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin" /> กำลังโหลดตารางคะแนน...
      </div>
    );
  }
  if (!sheet) {
    return <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-muted)]">{message || "ไม่พบข้อมูล"}</div>;
  }
  if (sheet.subjects.length === 0) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">ยังไม่มีวิชา — กรุณาตั้งวิชาในขั้น &quot;ห้องและวิชา&quot; ก่อน แล้วจึงกรอกคะแนน</div>;
  }

  // คะแนนเต็มรวม = ผลรวมคะแนนเต็มทุกวิชา (แสดงเมื่อทุกวิชามีคะแนนเต็มครบ)
  const totalMax = sheet.subjects.every((subject) => subject.maxScore != null)
    ? sheet.subjects.reduce((sum, subject) => sum + (subject.maxScore ?? 0), 0)
    : null;

  const hasPending = Object.keys(edits).length > 0 || Object.keys(absentEdits).length > 0;
  const pendingCount = countScoreDraftChanges({ edits, absentEdits });
  const pendingTone = syncState === "error"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : syncState === "offline" || !isOnline
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "text-slate-600";
  const pendingLabel = saving || syncState === "syncing"
    ? "กำลังบันทึก..."
    : hasPending && (syncState === "offline" || !isOnline)
      ? `รออินเทอร์เน็ต ${pendingCount} รายการ`
      : hasPending && syncState === "error"
        ? `บันทึกไม่สำเร็จ ${pendingCount} รายการ`
        : hasPending
          ? `รอบันทึก ${pendingCount} รายการ`
          : "บันทึกอัตโนมัติ";

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-sky-100 bg-white shadow-[0_8px_28px_rgba(14,165,233,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[linear-gradient(135deg,#f0f9ff,#fdf2f8)] px-4 py-3">
        <div className="text-sm">
          <span className="font-semibold text-slate-900">กรอกคะแนน</span>
          <span className="ml-2 text-[var(--text-muted)]">
            กรอกแล้ว <b className="text-sky-700">{filledCount}</b>/{visibleStudents.length} คน
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={room} onChange={(event) => setRoom(event.target.value)} className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="ALL">ทุกห้อง</option>
            {rooms.map((roomName) => (
              <option key={roomName} value={roomName}>ห้อง {roomName}</option>
            ))}
          </select>
          <span className={`inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium ${pendingTone}`}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin text-sky-600" /> {pendingLabel}
              </>
            ) : hasPending ? (
              <>
                <span className={`size-2 rounded-full ${syncState === "error" ? "bg-rose-500" : "bg-amber-400"}`} /> {pendingLabel}
              </>
            ) : (
              <>
                <Check size={14} className="text-emerald-500" /> {pendingLabel}
              </>
            )}
          </span>
          {hasPending && (
            <button
              type="button"
              onClick={() => void performSave({ force: true })}
              disabled={saving || !isOnline}
              className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ส่งคะแนนค้าง
            </button>
          )}
        </div>
      </div>

      {message && <div className="bg-pink-50 px-4 py-2 text-xs text-pink-700">{message}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#fbfdff] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">รหัส</th>
              <th className="px-3 py-2 font-medium">ชื่อ</th>
              <th className="px-3 py-2 font-medium">ห้อง</th>
              {sheet.subjects.map((subject, index) => (
                <th key={subject.id} className={`px-2 py-2 text-center font-medium ${index % 2 === 0 ? "text-sky-700" : "text-pink-700"}`}>
                  {subject.name}
                  {subject.maxScore != null && <span className="font-normal opacity-60"> ({subject.maxScore})</span>}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">
                รวม
                {totalMax != null && <span className="font-normal opacity-60"> ({totalMax})</span>}
              </th>
              <th className="px-2 py-2 text-center font-medium">ขาดสอบ</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student) => (
              <tr key={student.id} className="border-t border-sky-50">
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{student.examNo}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{student.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{classLevel}/{student.room}</td>
                {sheet.subjects.map((subject, index) => (
                  <td key={subject.id} className="px-1.5 py-1">
                    {(() => {
                      const pendingCell = edits[student.id]?.[subject.id] !== undefined;
                      const pendingClass = pendingCell
                        ? syncState === "error"
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : syncState === "offline" || !isOnline
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        : "";
                      return (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={subject.maxScore ?? undefined}
                      disabled={isAbsent(student)}
                      value={isAbsent(student) ? "" : cellValue(student, subject.id)}
                      onChange={(event) => setCell(student.id, subject.id, event.target.value)}
                      className={`w-16 rounded-lg border px-2 py-1 text-center font-semibold outline-none focus:ring-2 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 ${
                        index % 2 === 0 ? "border-sky-100 bg-sky-50/50 text-sky-700 focus:ring-sky-200" : "border-pink-100 bg-pink-50/50 text-pink-700 focus:ring-pink-200"
                      } ${pendingClass}`}
                      placeholder="–"
                    />
                      );
                    })()}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-center font-semibold text-slate-900">
                  {isAbsent(student) ? (
                    <span className="text-xs font-medium text-slate-400">ไม่ได้เข้าสอบ</span>
                  ) : (
                    rowTotal(student) || "–"
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label={`ไม่ได้เข้าสอบ ${student.name}`}
                    checked={isAbsent(student)}
                    onChange={() => toggleAbsent(student)}
                    className="size-4 cursor-pointer accent-slate-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    aria-label={`ลบ ${student.name}`}
                    disabled={deletingId === student.id}
                    onClick={() => deleteStudentRow(student)}
                    className="inline-grid size-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50 disabled:opacity-40"
                  >
                    {deletingId === student.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </td>
              </tr>
            ))}
            {visibleStudents.length === 0 && (
              <tr><td colSpan={sheet.subjects.length + 6} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">ยังไม่มีนักเรียน — นำเข้ารายชื่อก่อน</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
