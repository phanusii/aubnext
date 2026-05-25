"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  FileSpreadsheet,
  LogIn,
  Megaphone,
  Save,
  School,
  Upload,
} from "lucide-react";

type Mapping = {
  examNo: string;
  studentName: string;
  classLevel: string;
  room: string;
  verifier: string;
  subjects: string[];
};

type Preview = {
  filename: string;
  headers: string[];
  mapping: Mapping;
  previewRows: Record<string, unknown>[];
  rawRows: Record<string, unknown>[];
  totalRows: number;
  errors: string[];
};

type Exam = {
  id: string;
  name: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  status: "DRAFT" | "PUBLISHED";
  wholeLevelQuota: number | null;
  publishedAt: string | null;
  _count?: { students: number; resultSnapshots: number };
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminConsole() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState({
    schoolName: "โรงเรียนตัวอย่าง",
    examTitle: "ประกาศผลสอบแข่งขัน",
    logoUrl: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [examName, setExamName] = useState("สอบแข่งขันประจำปี");
  const [classLevel, setClassLevel] = useState("ม.1");
  const [selectionMode, setSelectionMode] = useState<"PER_ROOM" | "WHOLE_LEVEL">("PER_ROOM");
  const [wholeLevelQuota, setWholeLevelQuota] = useState(10);
  const [roomQuotaText, setRoomQuotaText] = useState("1=5\n2=5\n3=5");
  const [tieBreakText, setTieBreakText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const subjectOptions = preview?.mapping.subjects ?? [];

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId),
    [exams, selectedExamId],
  );

  async function loadExams() {
    const response = await fetch("/api/exams");
    if (response.ok) {
      const data = await response.json();
      setExams(data);
      if (!selectedExamId && data[0]) setSelectedExamId(data[0].id);
    }
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) =>
        setSettings({
          schoolName: data.schoolName ?? "โรงเรียนตัวอย่าง",
          examTitle: data.examTitle ?? "ประกาศผลสอบแข่งขัน",
          logoUrl: data.logoUrl ?? "",
        }),
      )
      .catch(() => undefined);
  }, []);

  async function login() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("รหัสผ่านไม่ถูกต้อง");
      return;
    }
    setIsLoggedIn(true);
    setPassword("");
    setMessage("เข้าสู่ระบบแล้ว");
    await loadExams();
  }

  async function saveSettings() {
    setBusy(true);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setBusy(false);
    setMessage(response.ok ? "บันทึกตั้งค่าโรงเรียนแล้ว" : "บันทึกตั้งค่าไม่สำเร็จ");
  }

  async function uploadExcel(file: File) {
    setBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/import/excel", { method: "POST", body: formData });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "อ่านไฟล์ไม่สำเร็จ");
      return;
    }

    setPreview(data);
    setTieBreakText(data.mapping.subjects[0] ?? "");
    setMessage(`อ่านไฟล์ ${data.totalRows} แถวแล้ว`);
  }

  function updateMapping(key: keyof Mapping, value: string | string[]) {
    if (!preview) return;
    setPreview({
      ...preview,
      mapping: {
        ...preview.mapping,
        [key]: value,
      },
    });
  }

  function parseRoomQuotas() {
    return Object.fromEntries(
      roomQuotaText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [room, quota] = line.split("=").map((value) => value.trim());
          return [room, Number(quota || 0)];
        }),
    );
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    setMessage("");

    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examName,
        classLevel,
        selectionMode,
        wholeLevelQuota,
        roomQuotas: parseRoomQuotas(),
        tieBreakSubjects: tieBreakText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        filename: preview.filename,
        mapping: preview.mapping,
        rawRows: preview.rawRows,
      }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.errors?.join(" / ") ?? data.error ?? "นำเข้าไม่สำเร็จ");
      return;
    }

    setSelectedExamId(data.exam.id);
    setMessage("สร้างรอบสอบจาก Excel แล้ว");
    await loadExams();
  }

  async function runExamAction(action: "calculate" | "publish") {
    if (!selectedExamId) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExamId}/${action}`, { method: "POST" });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }

    setMessage(action === "calculate" ? `คำนวณแล้ว ${data.results.length} รายการ` : "ประกาศผลแล้ว");
    await loadExams();
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] text-[#16211d]">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
          <div className="rounded-lg border border-[#d7cdbb] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-md bg-[#1d5c4a] text-white">
                <School size={22} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Admin Console</h1>
                <p className="text-sm text-[#65736d]">{settings.examTitle}</p>
              </div>
            </div>
            <label className="text-sm font-medium" htmlFor="password">
              รหัสผ่านผู้ดูแล
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && login()}
              className="mt-2 h-11 w-full rounded-md border border-[#cfc7b8] px-3 outline-none focus:border-[#1d5c4a]"
            />
            <button
              type="button"
              onClick={login}
              disabled={busy}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#1d5c4a] px-4 font-medium text-white disabled:opacity-60"
            >
              <LogIn size={18} />
              เข้าสู่ระบบ
            </button>
            {message && <p className="mt-4 text-sm text-[#9a4b2f]">{message}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] text-[#16211d]">
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#d8cfc0] pb-5">
          <div className="flex items-center gap-4">
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="size-14 rounded-md object-cover" />
            ) : (
              <div className="grid size-14 place-items-center rounded-md bg-[#1d5c4a] text-white">
                <School size={26} />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold">{settings.schoolName}</h1>
              <p className="text-sm text-[#65736d]">{settings.examTitle}</p>
            </div>
          </div>
          <a
            href="/check-result"
            className="rounded-md border border-[#1d5c4a] px-4 py-2 text-sm font-medium text-[#1d5c4a]"
          >
            หน้าเช็คผล
          </a>
        </header>

        {message && (
          <div className="mb-5 rounded-md border border-[#d6bfa7] bg-[#fff8ee] px-4 py-3 text-sm text-[#713f12]">
            {message}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <section className="space-y-5">
            <div className="rounded-lg border border-[#d7cdbb] bg-white p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <Save size={18} />
                ตั้งค่าโรงเรียน
              </h2>
              <label className="text-sm font-medium">ชื่อโรงเรียน</label>
              <input
                value={settings.schoolName}
                onChange={(event) => setSettings({ ...settings, schoolName: event.target.value })}
                className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
              />
              <label className="mt-3 block text-sm font-medium">ชื่อเรื่องการสอบ</label>
              <input
                value={settings.examTitle}
                onChange={(event) => setSettings({ ...settings, examTitle: event.target.value })}
                className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
              />
              <label className="mt-3 block text-sm font-medium">URL โลโก้โรงเรียน</label>
              <input
                value={settings.logoUrl}
                onChange={(event) => setSettings({ ...settings, logoUrl: event.target.value })}
                className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
              />
              <button
                type="button"
                onClick={saveSettings}
                disabled={busy}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#1d5c4a] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                <Save size={16} />
                บันทึก
              </button>
            </div>

            <div className="rounded-lg border border-[#d7cdbb] bg-white p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <Megaphone size={18} />
                รอบสอบ
              </h2>
              <select
                value={selectedExamId}
                onChange={(event) => setSelectedExamId(event.target.value)}
                className="h-10 w-full rounded-md border border-[#cfc7b8] px-3"
              >
                <option value="">เลือกรอบสอบ</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name} / {exam.status}
                  </option>
                ))}
              </select>
              {selectedExam && (
                <div className="mt-3 rounded-md bg-[#f4f1eb] p-3 text-sm">
                  <div className="font-medium">{selectedExam.name}</div>
                  <div className="text-[#65736d]">
                    {selectedExam.classLevel} · {selectedExam._count?.students ?? 0} คน ·{" "}
                    {selectedExam.selectionMode === "PER_ROOM" ? "รายห้อง" : "ทั้งชั้น"}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runExamAction("calculate")}
                  disabled={busy || !selectedExamId}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[#2f5d8c] px-3 text-sm font-medium text-[#2f5d8c] disabled:opacity-50"
                >
                  <Calculator size={16} />
                  คำนวณ
                </button>
                <button
                  type="button"
                  onClick={() => runExamAction("publish")}
                  disabled={busy || !selectedExamId}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[#9a4b2f] px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  <BadgeCheck size={16} />
                  ประกาศผล
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-lg border border-[#d7cdbb] bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold">
                  <FileSpreadsheet size={18} />
                  นำเข้า Excel
                </h2>
                <a
                  href="/exam-template.csv"
                  className="rounded-md border border-[#cfc7b8] px-3 py-2 text-sm font-medium"
                >
                  template CSV
                </a>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium">
                  ชื่อรอบสอบ
                  <input
                    value={examName}
                    onChange={(event) => setExamName(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
                  />
                </label>
                <label className="block text-sm font-medium">
                  ระดับชั้น
                  <input
                    value={classLevel}
                    onChange={(event) => setClassLevel(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ["PER_ROOM", "รายห้อง"],
                  ["WHOLE_LEVEL", "ทั้งชั้น"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectionMode(value as "PER_ROOM" | "WHOLE_LEVEL")}
                    className={classNames(
                      "rounded-md border px-4 py-2 text-sm font-medium",
                      selectionMode === value
                        ? "border-[#1d5c4a] bg-[#1d5c4a] text-white"
                        : "border-[#cfc7b8]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectionMode === "WHOLE_LEVEL" ? (
                <label className="mt-4 block text-sm font-medium">
                  จำนวนผู้ผ่านทั้งชั้น
                  <input
                    type="number"
                    min={0}
                    value={wholeLevelQuota}
                    onChange={(event) => setWholeLevelQuota(Number(event.target.value))}
                    className="mt-1 h-10 w-40 rounded-md border border-[#cfc7b8] px-3"
                  />
                </label>
              ) : (
                <label className="mt-4 block text-sm font-medium">
                  โควตารายห้อง
                  <textarea
                    value={roomQuotaText}
                    onChange={(event) => setRoomQuotaText(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-[#cfc7b8] px-3 py-2 font-mono text-sm"
                  />
                </label>
              )}

              <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9ad9b] bg-[#fbfaf7] px-4 text-center">
                <Upload size={24} className="mb-2 text-[#1d5c4a]" />
                <span className="font-medium">เลือกไฟล์ .xlsx, .xls หรือ .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => event.target.files?.[0] && uploadExcel(event.target.files[0])}
                  className="sr-only"
                />
              </label>
            </div>

            {preview && (
              <div className="rounded-lg border border-[#d7cdbb] bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">ตรวจข้อมูลนำเข้า</h2>
                    <p className="text-sm text-[#65736d]">
                      {preview.filename} · {preview.totalRows} แถว
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={commitImport}
                    disabled={busy}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[#1d5c4a] px-4 text-sm font-medium text-white disabled:opacity-60"
                  >
                    <Save size={16} />
                    สร้างรอบสอบ
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {(
                    [
                      ["examNo", "เลขประจำตัว"],
                      ["studentName", "ชื่อ-สกุล"],
                      ["classLevel", "ระดับชั้น"],
                      ["room", "ห้อง"],
                      ["verifier", "วันเกิด/PIN"],
                    ] as Array<[keyof Mapping, string]>
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm font-medium">
                      {label}
                      <select
                        value={preview.mapping[key] as string}
                        onChange={(event) => updateMapping(key, event.target.value)}
                        className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-2"
                      >
                        <option value="">เลือกคอลัมน์</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-medium">คอลัมน์คะแนน</div>
                  <div className="flex flex-wrap gap-2">
                    {preview.headers.map((header) => {
                      const checked = preview.mapping.subjects.includes(header);
                      return (
                        <button
                          key={header}
                          type="button"
                          onClick={() =>
                            updateMapping(
                              "subjects",
                              checked
                                ? preview.mapping.subjects.filter((subject) => subject !== header)
                                : [...preview.mapping.subjects, header],
                            )
                          }
                          className={classNames(
                            "rounded-md border px-3 py-2 text-sm",
                            checked ? "border-[#2f5d8c] bg-[#eaf3fb]" : "border-[#cfc7b8]",
                          )}
                        >
                          {header}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="mt-4 block text-sm font-medium">
                  ลำดับวิชา tie-break
                  <input
                    value={tieBreakText}
                    onChange={(event) => setTieBreakText(event.target.value)}
                    list="subject-options"
                    className="mt-1 h-10 w-full rounded-md border border-[#cfc7b8] px-3"
                  />
                </label>
                <datalist id="subject-options">
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject} />
                  ))}
                </datalist>

                {preview.errors.length > 0 && (
                  <div className="mt-4 rounded-md border border-[#e2b7a4] bg-[#fff5f1] p-3 text-sm text-[#8a341d]">
                    {preview.errors.slice(0, 6).map((error) => (
                      <div key={error}>{error}</div>
                    ))}
                  </div>
                )}

                <div className="mt-4 overflow-x-auto rounded-md border border-[#e3dccf]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f4f1eb]">
                      <tr>
                        {preview.headers.map((header) => (
                          <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, index) => (
                        <tr key={index} className="border-t border-[#e3dccf]">
                          {preview.headers.map((header) => (
                            <td key={header} className="whitespace-nowrap px-3 py-2">
                              {String(row[header] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
