"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";

type Subject = { id: string; name: string; maxScore: number | null };
type Student = { id: string; examNo: string; name: string; room: string; scores: Record<string, number> };
type Sheet = { subjects: Subject[]; students: Student[] };

// แก้คะแนนเก็บเป็น string ต่อ (studentId -> subjectId -> ค่าที่พิมพ์)
type Edits = Record<string, Record<string, string>>;

function isFilled(student: Student, subjects: Subject[], edits: Edits) {
  return subjects.every((subject) => {
    const edited = edits[student.id]?.[subject.id];
    const value = edited !== undefined ? edited : student.scores[subject.id];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

export function ScoreEntryCard({ examId, onSaved }: { examId: string; onSaved?: () => void }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [room, setRoom] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    () => (sheet ? visibleStudents.filter((student) => isFilled(student, sheet.subjects, edits)).length : 0),
    [sheet, visibleStudents, edits],
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
    setEdits((current) => ({ ...current, [studentId]: { ...current[studentId], [subjectId]: value } }));
  }

  async function save() {
    if (Object.keys(edits).length === 0) {
      setMessage("ยังไม่มีการแก้ไข");
      return;
    }
    setSaving(true);
    setMessage("");
    const updates = Object.entries(edits).map(([studentId, scores]) => ({
      studentId,
      scores: Object.fromEntries(
        Object.entries(scores).map(([subjectId, raw]) => [subjectId, raw.trim() === "" ? null : Number(raw)]),
      ),
    }));
    try {
      const response = await fetch(`/api/exams/${examId}/scores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      // อัปเดต sheet ในมือให้ตรง แล้วล้าง edits
      setSheet((current) => {
        if (!current) return current;
        return {
          ...current,
          students: current.students.map((student) => {
            const studentEdits = edits[student.id];
            if (!studentEdits) return student;
            const scores = { ...student.scores };
            for (const [subjectId, raw] of Object.entries(studentEdits)) {
              if (raw.trim() === "") delete scores[subjectId];
              else scores[subjectId] = Number(raw);
            }
            return { ...student, scores };
          }),
        };
      });
      setEdits({});
      setMessage("บันทึกคะแนนแล้ว");
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

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
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#f472b6,#38bdf8)] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            บันทึก
          </button>
        </div>
      </div>

      {message && <div className="bg-pink-50 px-4 py-2 text-xs text-pink-700">{message}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#fbfdff] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">รหัส</th>
              <th className="px-3 py-2 font-medium">ชื่อ</th>
              {sheet.subjects.map((subject, index) => (
                <th key={subject.id} className={`px-2 py-2 text-center font-medium ${index % 2 === 0 ? "text-sky-700" : "text-pink-700"}`}>
                  {subject.name}
                  {subject.maxScore != null && <span className="block text-[10px] font-normal opacity-60">เต็ม {subject.maxScore}</span>}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">รวม</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student) => (
              <tr key={student.id} className="border-t border-sky-50">
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{student.examNo}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{student.name}</td>
                {sheet.subjects.map((subject, index) => (
                  <td key={subject.id} className="px-1.5 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={subject.maxScore ?? undefined}
                      value={cellValue(student, subject.id)}
                      onChange={(event) => setCell(student.id, subject.id, event.target.value)}
                      className={`w-16 rounded-lg border px-2 py-1 text-center font-semibold outline-none focus:ring-2 ${
                        index % 2 === 0 ? "border-sky-100 bg-sky-50/50 text-sky-700 focus:ring-sky-200" : "border-pink-100 bg-pink-50/50 text-pink-700 focus:ring-pink-200"
                      }`}
                      placeholder="–"
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-center font-semibold text-slate-900">{rowTotal(student) || "–"}</td>
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
              <tr><td colSpan={sheet.subjects.length + 4} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">ยังไม่มีนักเรียน — นำเข้ารายชื่อก่อน</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
