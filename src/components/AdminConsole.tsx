"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import {
  BadgeCheck,
  BookOpen,
  Calculator,
  ClipboardList,
  ImageUp,
  LogIn,
  Megaphone,
  Plus,
  Save,
  School,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { prepareRoomImportTable } from "@/lib/room-import-table";

type RoomQuota = { id?: string; room: string; quota: number };
type Subject = {
  id?: string;
  name: string;
  maxScore: number;
  sortOrder: number;
  tieBreakOrder?: number | null;
};
type Exam = {
  id: string;
  name: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  status: "DRAFT" | "PUBLISHED";
  wholeLevelQuota: number | null;
  publishedAt: string | null;
  roomQuotas: RoomQuota[];
  subjects: Subject[];
  _count?: { students: number; resultSnapshots: number };
};
type CalculatedResult = {
  studentId: string;
  examNo: string;
  name: string;
  rank: number;
  totalScore: number;
  status: "PASSED" | "FAILED" | "REVIEW";
  reason: string;
  room: string;
  scoreBreakdown: Record<string, number>;
};
type ImportValidation = {
  rowCount: number;
  subjectCount: number;
  scoreCellCount: number;
  errors: string[];
  isReady: boolean;
};

const emptySubject = (sortOrder = 0): Subject => ({
  name: "",
  maxScore: 100,
  sortOrder,
  tieBreakOrder: null,
});

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function selectNumberInput(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

export function AdminConsole() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState({
    schoolName: "โรงเรียนตัวอย่าง",
    logoUrl: "",
    activeExamSessionId: "",
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoChanged, setLogoChanged] = useState(false);

  const [newExamName, setNewExamName] = useState("สอบแข่งขันประจำปี");
  const [newClassLevel, setNewClassLevel] = useState("ป.6");
  const [newSelectionMode, setNewSelectionMode] = useState<"PER_ROOM" | "WHOLE_LEVEL">("PER_ROOM");
  const [newWholeQuota, setNewWholeQuota] = useState(10);
  const [roomCount, setRoomCount] = useState(3);
  const [rooms, setRooms] = useState<RoomQuota[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([emptySubject(0)]);
  const [importRoom, setImportRoom] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [calculatedResults, setCalculatedResults] = useState<CalculatedResult[]>([]);

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId),
    [exams, selectedExamId],
  );
  const pasteValidation = useMemo(
    () => validateImportPreview(pasteText, subjects),
    [pasteText, subjects],
  );

  const loadExams = useCallback(async (preferredExamId?: string) => {
    const response = await fetch("/api/exams");
    if (response.ok) {
      const data: Exam[] = await response.json();
      setExams(data);
      setSelectedExamId((current) => {
        const nextId = preferredExamId || current;
        if (nextId && data.some((exam) => exam.id === nextId)) return nextId;
        return data[0]?.id ?? "";
      });
    }
  }, []);

  const loadStoredResults = useCallback(async (examId: string) => {
    const response = await fetch(`/api/exams/${examId}/results`);
    if (!response.ok) return;
    const data = await response.json();
    setCalculatedResults(data.results ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) =>
        setSettings({
          schoolName: data.schoolName ?? "โรงเรียนตัวอย่าง",
          logoUrl: data.logoUrl ?? "",
          activeExamSessionId: data.activeExamSessionId ?? "",
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => {
        if (!response.ok) return;
        setIsLoggedIn(true);
        return loadExams();
      })
      .catch(() => undefined);
  }, [loadExams]);

  useEffect(() => {
    if (!selectedExam) return;
    queueMicrotask(() => {
      setRooms(selectedExam.roomQuotas.map((room) => ({ id: room.id, room: room.room, quota: room.quota })));
      setSubjects(
        selectedExam.subjects.length > 0
          ? selectedExam.subjects.map((subject, index) => ({
              id: subject.id,
              name: subject.name,
              maxScore: Number(subject.maxScore ?? 100),
              sortOrder: subject.sortOrder ?? index,
              tieBreakOrder: subject.tieBreakOrder ?? null,
            }))
          : [emptySubject(0)],
      );
      setImportRoom(selectedExam.roomQuotas[0]?.room ?? "");
      setCalculatedResults([]);
      void loadStoredResults(selectedExam.id);
    });
  }, [loadStoredResults, selectedExam]);

  async function login() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);

    if (!response.ok) {
      setMessage("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    setIsLoggedIn(true);
    setEmail("");
    setPassword("");
    setMessage("เข้าสู่ระบบแล้ว");
    await loadExams();
  }

  async function saveSettings() {
    setBusy(true);
    const body = {
      schoolName: settings.schoolName,
      activeExamSessionId: settings.activeExamSessionId || null,
      ...(logoChanged ? { logoUrl: settings.logoUrl } : {}),
    };
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setIsLoggedIn(false);
      setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    if (!response.ok) {
      setMessage(data.error ?? "บันทึกตั้งค่าไม่สำเร็จ");
      return;
    }

    setLogoChanged(false);
    setSettings((current) => ({
      schoolName: data.schoolName ?? current.schoolName,
      logoUrl: data.logoUrl ?? current.logoUrl,
      activeExamSessionId: data.activeExamSessionId ?? "",
    }));
    setMessage("บันทึกตั้งค่าระบบแล้ว");
  }

  function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      setMessage("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage("โลโก้ต้องมีขนาดไม่เกิน 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const logoUrl = String(reader.result ?? "");
      if (logoUrl.length > 1_400_000) {
        setMessage("โลโก้ใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 1MB");
        return;
      }

      setLogoChanged(true);
      setSettings((current) => ({ ...current, logoUrl }));
    };
    reader.readAsDataURL(file);
  }

  function buildInitialRooms() {
    return Array.from({ length: Math.max(1, roomCount) }, (_, index) => ({
      room: String(index + 1),
      quota: newSelectionMode === "PER_ROOM" ? 1 : 0,
    }));
  }

  async function createExam() {
    setBusy(true);
    const response = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newExamName,
        classLevel: newClassLevel,
        selectionMode: newSelectionMode,
        wholeLevelQuota: newWholeQuota,
        rooms: buildInitialRooms(),
      }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "สร้างรอบสอบไม่สำเร็จ");
      return;
    }

    setMessage("สร้างรอบสอบแล้ว กรุณาสร้างวิชาและนำเข้ารายชื่อทีละห้อง");
    await loadExams(data.exam.id);
  }

  async function saveRooms() {
    if (!selectedExam) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/rooms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? "บันทึกห้องและโควตาแล้ว" : data.error ?? "บันทึกห้องไม่สำเร็จ");
    await loadExams();
  }

  async function saveSubjects() {
    if (!selectedExam) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/subjects`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjects: subjects.map((subject, index) => ({
          name: subject.name,
          maxScore: Number(subject.maxScore),
          sortOrder: index,
          tieBreakOrder: subject.tieBreakOrder ? Number(subject.tieBreakOrder) : null,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? "บันทึกวิชาแล้ว" : data.error ?? "บันทึกวิชาไม่สำเร็จ");
    await loadExams();
  }

  async function importPastedRows() {
    if (!selectedExam || !importRoom) return;
    if (!pasteValidation?.isReady) {
      setMessage(pasteValidation?.errors.join(" / ") || "กรุณาตรวจข้อมูลรหัสนักเรียน ชื่อ และคะแนนก่อนนำเข้า");
      return;
    }

    const confirmed = window.confirm(
      [
        `ตรวจข้อมูลแล้ว ${pasteValidation.rowCount} คน`,
        `วิชาที่พบ ${pasteValidation.subjectCount} วิชา`,
        `คะแนนถูกต้อง ${pasteValidation.scoreCellCount} ช่อง`,
        `ยืนยันนำเข้าห้อง ${importRoom} หรือไม่`,
      ].join("\n"),
    );
    if (!confirmed) return;

    const { rows } = prepareRoomImportTable(pasteText, subjects);
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/rooms/${encodeURIComponent(importRoom)}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawRows: rows }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.errors?.join(" / ") ?? data.error ?? "นำเข้าไม่สำเร็จ");
      return;
    }

    setPasteText("");
    setCalculatedResults([]);
    setMessage(`นำเข้า ${data.imported} คนในห้อง ${importRoom} แล้ว`);
    await loadExams();
  }

  async function importFile(file: File) {
    if (!selectedExam || !importRoom) return;
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/rooms/${encodeURIComponent(importRoom)}/import`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.errors?.join(" / ") ?? data.error ?? "นำเข้าไม่สำเร็จ");
      return;
    }

    setCalculatedResults([]);
    setMessage(`นำเข้า ${data.imported} คนในห้อง ${importRoom} แล้ว`);
    await loadExams();
  }

  async function runExamAction(action: "calculate" | "publish") {
    if (!selectedExam) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/${action}`, { method: "POST" });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }

    if (action === "calculate") {
      setCalculatedResults(data.results ?? []);
      setMessage(`คำนวณแล้ว ${data.results?.length ?? 0} รายการ`);
    } else {
      setMessage("ประกาศผลแล้ว");
      await loadStoredResults(selectedExam.id);
      await loadExams();
    }
  }

  const resultSummary = useMemo(() => {
    const passed = calculatedResults.filter((result) => result.status === "PASSED").length;
    const review = calculatedResults.filter((result) => result.status === "REVIEW").length;
    const failed = calculatedResults.filter((result) => result.status === "FAILED").length;
    return { passed, review, failed, total: calculatedResults.length };
  }, [calculatedResults]);

  const resultsByRoom = useMemo(() => {
    const grouped = new Map<string, CalculatedResult[]>();
    for (const result of calculatedResults) {
      grouped.set(result.room, [...(grouped.get(result.room) ?? []), result]);
    }
    return Array.from(grouped.entries());
  }, [calculatedResults]);

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl bg-[var(--primary-blue)] text-white">
                <School size={23} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Admin Console</h1>
                <p className="text-sm text-[var(--text-muted)]">ระบบผู้ดูแล</p>
              </div>
            </div>
            <Field label="อีเมลผู้ดูแล">
              <input className="app-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="รหัสผ่านผู้ดูแล">
              <input
                className="app-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && login()}
              />
            </Field>
            <button type="button" onClick={login} disabled={busy} className="app-button-primary mt-4 w-full">
              <LogIn size={18} />
              เข้าสู่ระบบ
            </button>
            {message && <p className="mt-4 text-sm text-[var(--accent-pink-strong)]">{message}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-4">
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="size-14 rounded-xl object-cover ring-2 ring-[var(--pink-soft)]" />
            ) : (
              <div className="grid size-14 place-items-center rounded-xl bg-[var(--primary-blue)] text-white">
                <School size={26} />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold">{settings.schoolName}</h1>
              <p className="text-sm text-[var(--text-muted)]">{selectedExam?.name ?? "จัดการรอบสอบและประกาศผล"}</p>
            </div>
          </div>
          <a href="/check-result" className="app-button-secondary">
            หน้าเช็คผล
          </a>
        </header>

        {message && (
          <div className="mb-5 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] px-4 py-3 text-sm text-[var(--accent-pink-strong)]">
            {message}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <section className="space-y-5">
            <Panel icon={<Save size={18} />} title="ตั้งค่าระบบ">
              <Field label="ชื่อโรงเรียน">
                <input className="app-input" value={settings.schoolName} onChange={(event) => setSettings({ ...settings, schoolName: event.target.value })} />
              </Field>
              <Field label="โลโก้โรงเรียน">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--blue-wash)] px-3 py-3 text-sm text-[var(--text-muted)]">
                  <ImageUp size={18} className="text-[var(--primary-blue)]" />
                  อัปโหลดรูปภาพไม่เกิน 1MB
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => event.target.files?.[0] && uploadLogo(event.target.files[0])} />
                </label>
              </Field>
              <Field label="รอบสอบที่แสดงในหน้าเช็คผล">
                <select className="app-input" value={settings.activeExamSessionId} onChange={(event) => setSettings({ ...settings, activeExamSessionId: event.target.value })}>
                  <option value="">ใช้รอบสอบที่ประกาศล่าสุด</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>{exam.name} / {exam.status}</option>
                  ))}
                </select>
              </Field>
              <button type="button" onClick={saveSettings} disabled={busy} className="app-button-primary mt-4">
                <Save size={16} />
                บันทึกตั้งค่า
              </button>
            </Panel>

            <Panel icon={<Plus size={18} />} title="สร้างรอบสอบ">
              <Field label="ชื่อรอบสอบ">
                <input className="app-input" value={newExamName} onChange={(event) => setNewExamName(event.target.value)} />
              </Field>
              <Field label="ชั้นเรียน">
                <input className="app-input" value={newClassLevel} onChange={(event) => setNewClassLevel(event.target.value)} />
              </Field>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["PER_ROOM", "รายห้อง"],
                  ["WHOLE_LEVEL", "ทั้งชั้น"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNewSelectionMode(value as "PER_ROOM" | "WHOLE_LEVEL")}
                    className={cx("app-segment", newSelectionMode === value && "app-segment-active")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {newSelectionMode === "WHOLE_LEVEL" && (
                <Field label="จำนวนผู้ผ่านทั้งชั้น">
                  <input className="app-input" type="number" min={0} value={newWholeQuota} onFocus={selectNumberInput} onChange={(event) => setNewWholeQuota(Number(event.target.value))} />
                </Field>
              )}
              <Field label="จำนวนห้องในชั้น">
                <input className="app-input" type="number" min={1} value={roomCount} onFocus={selectNumberInput} onChange={(event) => setRoomCount(Number(event.target.value))} />
              </Field>
              <button type="button" onClick={createExam} disabled={busy} className="app-button-primary mt-4">
                <Plus size={16} />
                สร้างรอบสอบ
              </button>
            </Panel>
          </section>

          <section className="space-y-5">
            <Panel icon={<Megaphone size={18} />} title="รอบสอบและการประกาศผล">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <select className="app-input" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                  <option value="">เลือกรอบสอบ</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>{exam.name} / {exam.status}</option>
                  ))}
                </select>
                <button type="button" onClick={() => runExamAction("calculate")} disabled={busy || !selectedExam} className="app-button-secondary">
                  <Calculator size={16} />
                  คำนวณ
                </button>
                <button type="button" onClick={() => runExamAction("publish")} disabled={busy || !selectedExam} className="app-button-pink">
                  <BadgeCheck size={16} />
                  ประกาศผล
                </button>
              </div>
              {selectedExam && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric label="ชั้นเรียน" value={selectedExam.classLevel} />
                  <Metric label="รูปแบบ" value={selectedExam.selectionMode === "PER_ROOM" ? "รายห้อง" : "ทั้งชั้น"} />
                  <Metric label="นักเรียน" value={`${selectedExam._count?.students ?? 0} คน`} />
                </div>
              )}
            </Panel>

            {selectedExam && (
              <>
                <Panel icon={<Users size={18} />} title="ห้องเรียนและโควตา">
                  <div className="space-y-2">
                    {rooms.map((room, index) => (
                      <div key={room.id ?? `room-${index}`} className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                        <input className="app-input" value={room.room} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === index ? { ...item, room: event.target.value } : item))} />
                        <input className="app-input" type="number" min={0} value={room.quota} onFocus={selectNumberInput} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === index ? { ...item, quota: Number(event.target.value) } : item))} />
                        <button type="button" className="app-icon-button" onClick={() => setRooms(rooms.filter((_, itemIndex) => itemIndex !== index))}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="app-button-secondary" onClick={() => setRooms([...rooms, { room: String(rooms.length + 1), quota: 0 }])}>
                      <Plus size={16} />
                      เพิ่มห้อง
                    </button>
                    <button type="button" className="app-button-primary" onClick={saveRooms} disabled={busy}>
                      <Save size={16} />
                      บันทึกห้อง
                    </button>
                  </div>
                </Panel>

                <Panel icon={<BookOpen size={18} />} title="วิชาสอบและคะแนนเต็ม">
                  <div className="space-y-2">
                    {subjects.map((subject, index) => (
                      <div key={subject.id ?? `subject-${index}`} className="grid gap-2 lg:grid-cols-[1fr_120px_130px_auto]">
                        <input className="app-input" placeholder="ชื่อวิชา" value={subject.name} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                        <input className="app-input" type="number" min={1} value={subject.maxScore} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item))} />
                        <input className="app-input" type="number" min={1} placeholder="tie-break" value={subject.tieBreakOrder ?? ""} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, tieBreakOrder: event.target.value ? Number(event.target.value) : null } : item))} />
                        <button type="button" className="app-icon-button" onClick={() => setSubjects(subjects.filter((_, itemIndex) => itemIndex !== index))}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="app-button-secondary" onClick={() => setSubjects([...subjects, emptySubject(subjects.length)])}>
                      <Plus size={16} />
                      เพิ่มวิชา
                    </button>
                    <button type="button" className="app-button-primary" onClick={saveSubjects} disabled={busy}>
                      <Save size={16} />
                      บันทึกวิชา
                    </button>
                  </div>
                </Panel>

                <Panel icon={<ClipboardList size={18} />} title="นำเข้ารายชื่อพร้อมคะแนนทีละห้อง">
                  <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                    <Field label="เลือกห้อง">
                      <select className="app-input" value={importRoom} onChange={(event) => setImportRoom(event.target.value)}>
                        {rooms.map((room) => (
                          <option key={room.room} value={room.room}>{room.room}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] px-4 py-3 text-sm text-[var(--text-muted)]">
                      คอลัมน์ที่ต้องมี: <span className="font-medium text-[var(--text-main)]">student_id, student_name</span> และชื่อวิชา เช่น {subjects.map((subject) => subject.name).filter(Boolean).join(", ") || "คณิตศาสตร์"} หรือวางแบบไม่มีหัวตารางตามลำดับนี้ได้
                    </div>
                  </div>
                  <textarea
                    className="app-input mt-3 min-h-36 font-mono text-sm"
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={"student_id\tstudent_name\tคณิตศาสตร์\tวิทยาศาสตร์\n65001\tเด็กชายตัวอย่าง\t85\t78"}
                  />
                  {pasteValidation && (
                    <div className={cx("mt-3 rounded-xl border px-4 py-3 text-sm", pasteValidation.isReady ? "border-sky-200 bg-sky-50 text-sky-800" : "border-[var(--pink-soft)] bg-[var(--pink-wash)] text-[var(--accent-pink-strong)]")}>
                      {pasteValidation.isReady
                        ? `ตรวจข้อมูลพร้อมนำเข้า: รหัสนักเรียนและชื่อครบ ${pasteValidation.rowCount} คน, วิชา ${pasteValidation.subjectCount} วิชา, คะแนนถูกต้อง ${pasteValidation.scoreCellCount} ช่อง`
                        : pasteValidation.errors.slice(0, 4).join(" / ")}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="app-button-primary" onClick={importPastedRows} disabled={busy || !pasteText.trim()}>
                      <ClipboardList size={16} />
                      นำเข้าจากข้อมูลที่วาง
                    </button>
                    <label className="app-button-secondary cursor-pointer">
                      <UploadCloud size={16} />
                      อัปโหลด Excel/CSV
                      <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
                    </label>
                  </div>
                </Panel>

                <Panel icon={<Calculator size={18} />} title="ผลคะแนน อันดับ และผู้ผ่านเกณฑ์">
                  <div className="mb-4 grid gap-3 md:grid-cols-4">
                    <Metric label="ทั้งหมด" value={`${resultSummary.total} คน`} />
                    <Metric label="ผ่านเกณฑ์" value={`${resultSummary.passed} คน`} />
                    <Metric label="รอตรวจ" value={`${resultSummary.review} คน`} />
                    <Metric label="ไม่ผ่าน" value={`${resultSummary.failed} คน`} />
                  </div>
                  {calculatedResults.length > 0 ? (
                    selectedExam.selectionMode === "WHOLE_LEVEL" ? (
                      <ResultTable results={calculatedResults} subjects={subjects} />
                    ) : (
                      <div className="space-y-5">
                        {resultsByRoom.map(([room, results]) => (
                          <section key={room}>
                            <h3 className="mb-2 font-semibold text-[var(--primary-blue)]">ห้อง {room}</h3>
                            <ResultTable results={results} subjects={subjects} />
                          </section>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--blue-wash)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                      นำเข้าคะแนนแล้วกดคำนวณ เพื่อดูคะแนนรวม อันดับ และรายชื่อผู้ผ่านเกณฑ์ก่อนประกาศผล
                    </div>
                  )}
                </Panel>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--pink-wash)] text-[var(--accent-pink-strong)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block text-sm font-medium first:mt-0">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--blue-wash)] p-4">
      <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function normalizeColumnName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function findColumn(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeColumnName);
  return headers.find((header) => normalizedAliases.includes(normalizeColumnName(header)));
}

function validateImportPreview(text: string, subjects: Subject[]): ImportValidation | null {
  if (!text.trim()) return null;

  const parsed = prepareRoomImportTable(text, subjects);
  const activeSubjects = subjects.filter((subject) => subject.name.trim());
  const errors: string[] = [];
  const studentIdColumn = findColumn(parsed.headers, ["student_id", "รหัสนักเรียน", "exam_no", "เลขประจำตัว", "เลขที่สอบ", "รหัสสอบ"]);
  const studentNameColumn = findColumn(parsed.headers, ["student_name", "ชื่อนักเรียน", "ชื่อ-สกุล", "ชื่อ", "name"]);
  const seenStudentIds = new Set<string>();
  let scoreCellCount = 0;

  if (!studentIdColumn) errors.push("ไม่พบคอลัมน์ student_id หรือ รหัสนักเรียน");
  if (!studentNameColumn) errors.push("ไม่พบคอลัมน์ student_name หรือ ชื่อนักเรียน");
  if (activeSubjects.length === 0) errors.push("ต้องสร้างวิชาก่อนตรวจข้อมูลนำเข้า");
  if (parsed.rows.length === 0) errors.push("ไม่พบข้อมูลนักเรียน");

  for (const subject of activeSubjects) {
    if (!parsed.headers.includes(subject.name)) {
      errors.push(`ไม่พบคอลัมน์วิชา ${subject.name}`);
    }
  }

  parsed.rows.forEach((row, index) => {
    const rowNumber = parsed.firstDataRowNumber + index;
    const studentId = studentIdColumn ? String(row[studentIdColumn] ?? "").trim() : "";
    const studentName = studentNameColumn ? String(row[studentNameColumn] ?? "").trim() : "";

    if (!studentId) errors.push(`แถว ${rowNumber}: ไม่พบรหัสนักเรียน`);
    if (!studentName) errors.push(`แถว ${rowNumber}: ไม่พบชื่อนักเรียน`);
    if (studentId && seenStudentIds.has(studentId)) errors.push(`แถว ${rowNumber}: รหัสนักเรียนซ้ำ (${studentId})`);
    seenStudentIds.add(studentId);

    for (const subject of activeSubjects) {
      if (!parsed.headers.includes(subject.name)) continue;
      const rawScore = row[subject.name];
      const score = Number(rawScore);
      if (!Number.isFinite(score)) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} ไม่ใช่ตัวเลข`);
      } else if (score < 0) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} ต้องไม่ติดลบ`);
      } else if (subject.maxScore != null && score > subject.maxScore) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} เกินคะแนนเต็ม ${subject.maxScore}`);
      } else {
        scoreCellCount += 1;
      }
    }
  });

  return {
    rowCount: parsed.rows.length,
    subjectCount: activeSubjects.length,
    scoreCellCount,
    errors: [...new Set(errors)],
    isReady: errors.length === 0,
  };
}

function formatScore(value: number | undefined) {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function statusLabel(status: CalculatedResult["status"]) {
  if (status === "PASSED") return "ผ่าน";
  if (status === "REVIEW") return "รอตรวจ";
  return "ไม่ผ่าน";
}

function ResultTable({ results, subjects }: { results: CalculatedResult[]; subjects: Subject[] }) {
  const scoreSubjects = subjects.filter((subject) => subject.id);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--blue-wash)] text-[var(--text-muted)]">
          <tr>
            {["อันดับ", "รหัสนักเรียน", "ชื่อ", "ห้อง", ...scoreSubjects.map((subject) => subject.name), "คะแนนรวม", "สถานะ", "เหตุผล"].map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.studentId} className="border-t border-[var(--border-soft)]">
              <td className="px-3 py-2 font-semibold">{result.rank}</td>
              <td className="px-3 py-2">{result.examNo}</td>
              <td className="px-3 py-2">{result.name}</td>
              <td className="px-3 py-2">{result.room}</td>
              {scoreSubjects.map((subject) => (
                <td key={subject.id} className="px-3 py-2">{formatScore(result.scoreBreakdown[subject.id!])}</td>
              ))}
              <td className="px-3 py-2 font-semibold">{formatScore(result.totalScore)}</td>
              <td className="px-3 py-2">
                <span className={cx("rounded-full px-2 py-1 text-xs font-semibold", result.status === "PASSED" ? "bg-sky-100 text-sky-700" : result.status === "REVIEW" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                  {statusLabel(result.status)}
                </span>
              </td>
              <td className="min-w-72 px-3 py-2 text-[var(--text-muted)]">{result.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
