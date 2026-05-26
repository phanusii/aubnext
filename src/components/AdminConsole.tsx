"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import {
  BadgeCheck,
  BookOpen,
  Calculator,
  ClipboardList,
  Download,
  ImageUp,
  Link2,
  ListChecks,
  LogIn,
  Megaphone,
  Plus,
  Save,
  School,
  Search,
  Settings,
  Table2,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { formatExamOptionLabel } from "@/lib/exam-label";
import { prepareRoomImportTable } from "@/lib/room-import-table";
import { AppFooter } from "@/components/AppFooter";

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
  passTitle: string | null;
  passInstructions: string | null;
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
type PublicResultCacheHealth = {
  total: number;
  cached: number;
  missing: number;
};
type ImportValidation = {
  rowCount: number;
  subjectCount: number;
  scoreCellCount: number;
  errors: string[];
  isReady: boolean;
};
type AdminTab = "settings" | "exam" | "rooms" | "import" | "results" | "line";
type ExamAction = "calculate" | "publish";
type ResultStatusFilter = "ALL" | CalculatedResult["status"];
type ResultSort = "rank" | "score_desc" | "score_asc" | "exam_no";
type ResultExportStatus = "all" | "passed" | "failed";
type ResultExportLayout = "rooms" | "single";

const resultStatusOptions: Array<{ value: ResultStatusFilter; label: string }> = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "PASSED", label: "ผ่านเกณฑ์" },
  { value: "REVIEW", label: "รอตรวจ" },
  { value: "FAILED", label: "ไม่ผ่าน" },
];

const resultSortOptions: Array<{ value: ResultSort; label: string }> = [
  { value: "rank", label: "อันดับ" },
  { value: "score_desc", label: "คะแนนมากไปน้อย" },
  { value: "score_asc", label: "คะแนนน้อยไปมาก" },
  { value: "exam_no", label: "รหัสนักเรียน" },
];

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
    schoolContact: "",
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoChanged, setLogoChanged] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("settings");
  const [pendingExamAction, setPendingExamAction] = useState<ExamAction | null>(null);

  const [newExamName, setNewExamName] = useState("สอบแข่งขันประจำปี");
  const [newClassLevel, setNewClassLevel] = useState("ป.6");
  const [newSelectionMode, setNewSelectionMode] = useState<"PER_ROOM" | "WHOLE_LEVEL">("PER_ROOM");
  const [newWholeQuota, setNewWholeQuota] = useState(10);
  const [roomCount, setRoomCount] = useState(3);
  const [passTitle, setPassTitle] = useState("");
  const [passInstructions, setPassInstructions] = useState("");
  const [rooms, setRooms] = useState<RoomQuota[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([emptySubject(0)]);
  const [importRoom, setImportRoom] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [calculatedResults, setCalculatedResults] = useState<CalculatedResult[]>([]);
  const [resultsLoadedExamId, setResultsLoadedExamId] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);
  const [publicResultCacheHealth, setPublicResultCacheHealth] = useState<PublicResultCacheHealth | null>(null);
  const [cacheRepairingExamId, setCacheRepairingExamId] = useState("");
  const autoRepairStartedExamIds = useRef<Set<string>>(new Set());
  const [roomFilter, setRoomFilter] = useState("");
  const [resultRoomFilter, setResultRoomFilter] = useState("ALL");
  const [resultStatusFilter, setResultStatusFilter] = useState<ResultStatusFilter>("ALL");
  const [resultSort, setResultSort] = useState<ResultSort>("rank");
  const lineResultUrl = process.env.NEXT_PUBLIC_LIFF_ID ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}` : "/line";
  const webResultUrl = "/check-result";
  const schoolContactUrl = "/contact";

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
    setResultsLoading(true);
    try {
      const response = await fetch(`/api/exams/${examId}/results`);
      if (!response.ok) return;
      const data = await response.json();
      setCalculatedResults(data.results ?? []);
      setPublicResultCacheHealth(data.cacheHealth ?? null);
      setResultsLoadedExamId(examId);
    } finally {
      setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) =>
        setSettings({
          schoolName: data.schoolName ?? "โรงเรียนตัวอย่าง",
          logoUrl: data.logoUrl ?? "",
          activeExamSessionId: data.activeExamSessionId ?? "",
          schoolContact: data.schoolContact ?? "",
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
    if (!selectedExamId || !publicResultCacheHealth || publicResultCacheHealth.missing <= 0) return;
    if (resultsLoadedExamId !== selectedExamId) return;
    if (autoRepairStartedExamIds.current.has(selectedExamId)) return;

    const missingCount = publicResultCacheHealth.missing;
    autoRepairStartedExamIds.current.add(selectedExamId);
    let cancelled = false;

    async function autoRepairPublicResultCache() {
      setCacheRepairingExamId(selectedExamId);
      setMessage(`ระบบกำลังเตรียมแคชผลรายบุคคลอัตโนมัติ ${missingCount} รายการ`);

      const response = await fetch(`/api/exams/${selectedExamId}/results`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;

      setCacheRepairingExamId("");

      if (response.status === 401) {
        setIsLoggedIn(false);
        setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
      }

      if (!response.ok) {
        autoRepairStartedExamIds.current.delete(selectedExamId);
        setMessage(data.error ?? "เตรียมแคชผลรายบุคคลอัตโนมัติไม่สำเร็จ ระบบจะลองใหม่เมื่อเปิดหน้านี้อีกครั้ง");
        return;
      }

      const nextCacheHealth = data.cacheHealth ?? null;
      if ((nextCacheHealth?.missing ?? 0) > 0) {
        autoRepairStartedExamIds.current.delete(selectedExamId);
      }
      setPublicResultCacheHealth(nextCacheHealth);
      setMessage(`เตรียมแคชผลรายบุคคลอัตโนมัติแล้ว ${data.updated ?? 0} รายการ`);
    }

    void autoRepairPublicResultCache();
    return () => {
      cancelled = true;
    };
  }, [publicResultCacheHealth, resultsLoadedExamId, selectedExamId]);

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
      setPassTitle(selectedExam.passTitle ?? "");
      setPassInstructions(selectedExam.passInstructions ?? "");
      setCalculatedResults([]);
      setPublicResultCacheHealth(null);
      setResultsLoadedExamId("");
      setResultsLoading(false);
      setResultRoomFilter("ALL");
    });
  }, [selectedExam]);

  useEffect(() => {
    if (activeTab !== "results" || !selectedExam || resultsLoadedExamId === selectedExam.id) return;
    queueMicrotask(() => {
      void loadStoredResults(selectedExam.id);
    });
  }, [activeTab, loadStoredResults, resultsLoadedExamId, selectedExam]);

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
      schoolContact: settings.schoolContact.trim() || null,
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
      schoolContact: data.schoolContact ?? "",
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

  function openExamActionDialog(action: ExamAction) {
    if (!selectedExam || busy) return;
    setPendingExamAction(action);
  }

  async function confirmExamAction() {
    if (!pendingExamAction) return;
    await runExamAction(pendingExamAction);
    setPendingExamAction(null);
  }

  async function runExamAction(action: ExamAction) {
    if (!selectedExam) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/${action}`, {
      method: "POST",
      headers: action === "publish" ? { "Content-Type": "application/json" } : undefined,
      body: action === "publish"
        ? JSON.stringify({
            passTitle,
            passInstructions,
          })
        : undefined,
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }

    if (action === "calculate") {
      setCalculatedResults(data.results ?? []);
      setPublicResultCacheHealth({
        total: data.results?.length ?? 0,
        cached: data.results?.length ?? 0,
        missing: 0,
      });
      setResultsLoadedExamId(selectedExam.id);
      setMessage(`คำนวณแล้ว ${data.results?.length ?? 0} รายการ`);
    } else {
      setPublicResultCacheHealth(data.cacheHealth ?? null);
      setMessage(
        (data.cacheHealth?.missing ?? 0) > 0
          ? `ประกาศผลแล้ว ระบบกำลังเตรียมแคชผลรายบุคคลที่ยังขาด ${data.cacheHealth.missing} รายการอัตโนมัติ`
          : "ประกาศผลแล้ว และแคชผลรายบุคคลพร้อมใช้งาน",
      );
      await loadStoredResults(selectedExam.id);
      await loadExams();
    }
  }

  function resultExportUrl(status: ResultExportStatus, layout: ResultExportLayout) {
    if (!selectedExam) return "#";
    const params = new URLSearchParams({ status, layout });
    return `/api/exams/${selectedExam.id}/results/export?${params.toString()}`;
  }

  async function deletePublishedResults() {
    if (!selectedExam) return;
    const count = selectedExam._count?.resultSnapshots ?? calculatedResults.length;
    const confirmed = window.confirm(
      [
        `ต้องการลบข้อมูลประกาศผลของรอบ "${selectedExam.name}" แบบถาวรหรือไม่`,
        `ข้อมูลผลคะแนนที่จะลบ: ${count} รายการ`,
        "รอบสอบจะถูกเปลี่ยนกลับเป็น DRAFT และนักเรียนจะเช็คผลรอบนี้ไม่ได้จนกว่าจะคำนวณ/ประกาศใหม่",
      ].join("\n"),
    );
    if (!confirmed) return;

    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/results`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setIsLoggedIn(false);
      setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    if (!response.ok) {
      setMessage(data.error ?? "ลบข้อมูลประกาศผลไม่สำเร็จ");
      return;
    }

    setCalculatedResults([]);
    setPublicResultCacheHealth({ total: 0, cached: 0, missing: 0 });
    setResultsLoadedExamId(selectedExam.id);
    setMessage(`ลบข้อมูลประกาศผลแล้ว ${data.deleted ?? 0} รายการ`);
    await loadExams(selectedExam.id);
  }

  async function updateLineRichMenu() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/line/rich-menu", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setIsLoggedIn(false);
      setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setMessage(response.ok ? "อัปเดต Rich Menu ใน LINE แล้ว" : data.error ?? "อัปเดต Rich Menu ไม่สำเร็จ");
  }

  const visibleRooms = useMemo(
    () =>
      rooms
        .map((room, index) => ({ ...room, index }))
        .filter((room) => room.room.toLowerCase().includes(roomFilter.trim().toLowerCase())),
    [roomFilter, rooms],
  );
  const roomOptions = useMemo(() => {
    const values = new Set([...rooms.map((room) => room.room), ...calculatedResults.map((result) => result.room)].filter(Boolean));
    return Array.from(values).sort((first, second) => first.localeCompare(second, "th", { numeric: true }));
  }, [calculatedResults, rooms]);
  const visibleResults = useMemo(() => {
    const filtered = calculatedResults.filter((result) => {
      const matchesRoom = resultRoomFilter === "ALL" || result.room === resultRoomFilter;
      const matchesStatus = resultStatusFilter === "ALL" || result.status === resultStatusFilter;
      return matchesRoom && matchesStatus;
    });

    return [...filtered].sort((first, second) => {
      if (resultSort === "score_desc") {
        return second.totalScore - first.totalScore || first.rank - second.rank || first.examNo.localeCompare(second.examNo, "th", { numeric: true });
      }
      if (resultSort === "score_asc") {
        return first.totalScore - second.totalScore || first.rank - second.rank || first.examNo.localeCompare(second.examNo, "th", { numeric: true });
      }
      if (resultSort === "exam_no") {
        return first.examNo.localeCompare(second.examNo, "th", { numeric: true });
      }

      return (
        first.room.localeCompare(second.room, "th", { numeric: true }) ||
        first.rank - second.rank ||
        first.examNo.localeCompare(second.examNo, "th", { numeric: true })
      );
    });
  }, [calculatedResults, resultRoomFilter, resultSort, resultStatusFilter]);
  const visibleResultSummary = useMemo(() => {
    const passed = visibleResults.filter((result) => result.status === "PASSED").length;
    const review = visibleResults.filter((result) => result.status === "REVIEW").length;
    const failed = visibleResults.filter((result) => result.status === "FAILED").length;
    return { passed, review, failed, total: visibleResults.length };
  }, [visibleResults]);
  const resultExportSummary = useMemo(() => {
    const passed = calculatedResults.filter((result) => result.status === "PASSED").length;
    const failed = calculatedResults.filter((result) => result.status === "FAILED").length;
    return { all: calculatedResults.length, passed, failed };
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
          <AppFooter />
        </section>
      </main>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
    { id: "settings", label: "ตั้งค่า", icon: <Settings size={16} /> },
    { id: "exam", label: "รอบสอบ", icon: <Megaphone size={16} /> },
    { id: "rooms", label: "ห้องและวิชา", icon: <Table2 size={16} /> },
    { id: "import", label: "นำเข้าคะแนน", icon: <ClipboardList size={16} /> },
    { id: "results", label: "ผลคะแนน", icon: <Calculator size={16} /> },
    { id: "line", label: "LINE เช็คผล", icon: <Link2 size={16} /> },
  ];

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-soft)]">
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
          <div className="flex flex-wrap gap-2">
            <a href="/line" className="app-button-secondary">
              <Link2 size={16} />
              หน้า LINE
            </a>
            <a href="/check-result" className="app-button-secondary">
              หน้าเช็คผล
            </a>
          </div>
        </header>

        {message && (
          <div className="mb-5 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] px-4 py-3 text-sm text-[var(--accent-pink-strong)]">
            {message}
          </div>
        )}

        <nav className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                "flex min-w-max items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition",
                activeTab === tab.id && "bg-[var(--primary-blue)] text-white shadow-sm",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {selectedExam && <ExamContextBar exam={selectedExam} />}

        {activeTab === "settings" && (
          <Panel icon={<Save size={18} />} title="ตั้งค่าระบบ">
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div>
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
                      <option key={exam.id} value={exam.id}>{formatExamOptionLabel(exam)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="ติดต่อโรงเรียนใน Rich Menu LINE">
                  <input
                    className="app-input"
                    value={settings.schoolContact}
                    onChange={(event) => setSettings({ ...settings, schoolContact: event.target.value })}
                    placeholder="ใส่ลิงก์ เช่น https://line.me/... หรือเบอร์โทร เช่น 045123456"
                  />
                </Field>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                  หากกรอกเป็นเบอร์โทร ระบบจะเปิดเป็นปุ่มโทรออก ถ้ากรอกเป็นลิงก์ ระบบจะเปิดลิงก์นั้นจากปุ่มติดต่อโรงเรียนใน LINE
                </p>
                <button type="button" onClick={saveSettings} disabled={busy} className="app-button-primary mt-4">
                  <Save size={16} />
                  บันทึกตั้งค่า
                </button>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <a href={lineResultUrl} className="app-button-secondary" target="_blank" rel="noreferrer">
                    <Link2 size={16} />
                    ลิงก์ LINE แชท bot
                  </a>
                  <a href={webResultUrl} className="app-button-secondary" target="_blank" rel="noreferrer">
                    <Search size={16} />
                    ลิงก์ดูคะแนนหน้าเว็บ
                  </a>
                  <a href={schoolContactUrl} className="app-button-secondary" target="_blank" rel="noreferrer">
                    <Link2 size={16} />
                    ลิงก์ติดต่อโรงเรียน
                  </a>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-4">
                {settings.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.logoUrl} alt="" className="mx-auto size-28 rounded-2xl object-cover ring-2 ring-white" />
                ) : (
                  <div className="mx-auto grid size-28 place-items-center rounded-2xl bg-[var(--primary-blue)] text-white">
                    <School size={40} />
                  </div>
                )}
                <p className="mt-3 text-center text-sm font-semibold">{settings.schoolName}</p>
              </div>
            </div>
          </Panel>
        )}

        {activeTab === "exam" && (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
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

            <Panel icon={<Megaphone size={18} />} title="รอบสอบและการประกาศผล">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <select className="app-input" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                  <option value="">เลือกรอบสอบ</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>{formatExamOptionLabel(exam)}</option>
                  ))}
                </select>
                <button type="button" onClick={() => openExamActionDialog("calculate")} disabled={busy || !selectedExam} className="app-button-secondary">
                  <Calculator size={16} />
                  คำนวณ
                </button>
                <button type="button" onClick={() => openExamActionDialog("publish")} disabled={busy || !selectedExam} className="app-button-pink">
                  <BadgeCheck size={16} />
                  ประกาศผล
                </button>
              </div>
              {selectedExam ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Metric label="ชั้นเรียน" value={selectedExam.classLevel} />
                    <Metric label="รูปแบบ" value={selectedExam.selectionMode === "PER_ROOM" ? "รายห้อง" : "ทั้งชั้น"} />
                    <Metric label="นักเรียน" value={`${selectedExam._count?.students ?? 0} คน`} />
                    <Metric label="สถานะ" value={selectedExam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex items-center gap-2 font-semibold">
                      <BadgeCheck size={18} />
                      ข้อความแจ้งผู้ผ่านการคัดเลือก
                    </div>
                    <div className="grid gap-3">
                      <Field label="ผ่านเข้ารอบอะไร">
                        <input
                          className="app-input"
                          value={passTitle}
                          onChange={(event) => setPassTitle(event.target.value)}
                          placeholder="เช่น ผ่านเข้ารอบค่ายวิทยาศาสตร์และคณิตศาสตร์"
                        />
                      </Field>
                      <Field label="ต้องดำเนินการอย่างไร">
                        <textarea
                          className="app-input min-h-28"
                          value={passInstructions}
                          onChange={(event) => setPassInstructions(event.target.value)}
                          placeholder="เช่น ให้รายงานตัววันที่ 10 มิถุนายน เวลา 08.30 น. พร้อมสำเนาบัตรนักเรียน"
                        />
                      </Field>
                      <p className="text-xs leading-5 text-[var(--text-muted)]">
                        ข้อความนี้จะแสดงเฉพาะนักเรียนที่มีสถานะผ่านการคัดเลือก หลังจากกดประกาศผล
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState text="ยังไม่มีรอบสอบ เลือกสร้างรอบสอบใหม่ก่อนตั้งห้อง วิชา และนำเข้าคะแนน" />
              )}
            </Panel>
          </div>
        )}

        {activeTab !== "settings" && activeTab !== "exam" && !selectedExam && (
          <Panel icon={<Megaphone size={18} />} title="เลือกรอบสอบก่อน">
            <EmptyState text="กรุณาเลือกหรือสร้างรอบสอบในแท็บรอบสอบก่อนทำงานส่วนนี้" />
          </Panel>
        )}

        {activeTab === "rooms" && selectedExam && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
            <Panel icon={<Users size={18} />} title="ห้องเรียนและโควตา">
              <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    className="app-input"
                    style={{ paddingLeft: "2.5rem" }}
                    value={roomFilter}
                    onChange={(event) => setRoomFilter(event.target.value)}
                    placeholder="ค้นหาห้อง"
                  />
                </label>
                <button type="button" className="app-button-secondary" onClick={() => setRooms([...rooms, { room: String(rooms.length + 1), quota: 0 }])}>
                  <Plus size={16} />
                  เพิ่มห้อง
                </button>
              </div>
              <div className="max-h-[460px] overflow-y-auto rounded-xl border border-[var(--border-soft)]">
                <div className="grid grid-cols-[1fr_130px_56px] gap-2 bg-[var(--blue-wash)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                  <span>ห้อง</span>
                  <span>โควตา</span>
                  <span />
                </div>
                <div className="divide-y divide-[var(--border-soft)]">
                  {visibleRooms.map((room) => (
                    <div key={room.id ?? `room-${room.index}`} className="grid grid-cols-[1fr_130px_56px] gap-2 p-2">
                      <input className="app-input" value={room.room} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === room.index ? { ...item, room: event.target.value } : item))} />
                      <input className="app-input" type="number" min={0} value={room.quota} onFocus={selectNumberInput} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === room.index ? { ...item, quota: Number(event.target.value) } : item))} />
                      <button type="button" className="app-icon-button" onClick={() => setRooms(rooms.filter((_, itemIndex) => itemIndex !== room.index))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" className="app-button-primary mt-3" onClick={saveRooms} disabled={busy}>
                <Save size={16} />
                บันทึกห้อง
              </button>
            </Panel>

            <Panel icon={<BookOpen size={18} />} title="วิชาสอบและคะแนนเต็ม">
              <div className="mb-3 rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] px-4 py-3 text-sm text-[var(--text-muted)]">
                หากคะแนนรวมเท่ากัน ระบบจะดูคะแนนรายวิชาตามลำดับที่กำหนดในช่อง <span className="font-semibold text-[var(--text-main)]">ลำดับตัดสิน</span> เช่น ใส่ 1 ที่วิทยาศาสตร์เพื่อดูวิชานี้ก่อน และใส่ 2 ที่คณิตศาสตร์เพื่อดูถัดไป
              </div>
              <div className="mb-2 hidden grid-cols-[1fr_110px_120px_44px] gap-2 px-1 text-xs font-semibold text-[var(--text-muted)] lg:grid">
                <span>วิชา</span>
                <span>คะแนนเต็ม</span>
                <span>ลำดับตัดสิน</span>
                <span />
              </div>
              <div className="space-y-2">
                {subjects.map((subject, index) => (
                  <div key={subject.id ?? `subject-${index}`} className="grid gap-2 lg:grid-cols-[1fr_110px_120px_auto]">
                    <input className="app-input" placeholder="ชื่อวิชา" value={subject.name} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                    <input className="app-input" type="number" min={1} aria-label="คะแนนเต็ม" value={subject.maxScore} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item))} />
                    <input className="app-input" type="number" min={1} aria-label="ลำดับตัดสินเมื่อคะแนนเท่ากัน" placeholder="เช่น 1" value={subject.tieBreakOrder ?? ""} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, tieBreakOrder: event.target.value ? Number(event.target.value) : null } : item))} />
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
          </div>
        )}

        {activeTab === "import" && selectedExam && (
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
              className="app-input mt-3 min-h-56 font-mono text-sm"
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
        )}

        {activeTab === "results" && selectedExam && (
          <Panel icon={<ListChecks size={18} />} title="ผลคะแนน อันดับ และผู้ผ่านเกณฑ์">
            <div className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-2">
              <button
                type="button"
                onClick={() => setResultRoomFilter("ALL")}
                className={cx("min-w-max rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-muted)]", resultRoomFilter === "ALL" && "bg-white text-[var(--primary-blue-strong)] shadow-sm")}
              >
                ทุกห้อง
              </button>
              {roomOptions.map((room) => (
                <button
                  key={room}
                  type="button"
                  onClick={() => setResultRoomFilter(room)}
                  className={cx("min-w-max rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-muted)]", resultRoomFilter === room && "bg-white text-[var(--primary-blue-strong)] shadow-sm")}
                >
                  ห้อง {room}
                </button>
              ))}
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <Metric label="ที่แสดง" value={`${visibleResultSummary.total} คน`} />
              <Metric label="ผ่านเกณฑ์" value={`${visibleResultSummary.passed} คน`} />
              <Metric label="รอตรวจ" value={`${visibleResultSummary.review} คน`} />
              <Metric label="ไม่ผ่าน" value={`${visibleResultSummary.failed} คน`} />
            </div>

            <div className={cx(
              "mb-4 rounded-2xl border p-4",
              (publicResultCacheHealth?.missing ?? 0) > 0
                ? "border-pink-200 bg-pink-50/80"
                : "border-[var(--border-soft)] bg-white",
            )}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--text-main)]">สถานะเตรียมผลรายบุคคล</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    พร้อมใช้งาน {publicResultCacheHealth?.cached ?? 0}/{publicResultCacheHealth?.total ?? selectedExam._count?.resultSnapshots ?? 0} รายการ
                    {(publicResultCacheHealth?.missing ?? 0) > 0 ? ` · ขาด ${publicResultCacheHealth?.missing ?? 0} รายการ` : ""}
                  </p>
                  {cacheRepairingExamId === selectedExam.id ? (
                    <p className="mt-2 text-sm font-semibold text-sky-700">
                      ระบบกำลังเตรียมข้อมูลให้อัตโนมัติ ไม่ต้องกดซ่อมเอง
                    </p>
                  ) : (publicResultCacheHealth?.missing ?? 0) > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-pink-700">
                      ระบบจะเตรียมข้อมูลส่วนที่ขาดให้อัตโนมัติเมื่อเปิดหน้านี้
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      พร้อมให้นักเรียนเปิดดูผลคะแนน
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-2">
              <FilterControlGroup
                label="สถานะ"
                value={resultStatusFilter}
                options={resultStatusOptions}
                onChange={(value) => setResultStatusFilter(value as ResultStatusFilter)}
              />
              <FilterControlGroup
                label="เรียงลำดับ"
                value={resultSort}
                options={resultSortOptions}
                onChange={(value) => setResultSort(value as ResultSort)}
              />
            </div>

            <div className="mb-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--text-main)]">ดาวน์โหลด Excel</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    เลือกกลุ่มข้อมูล แล้วดาวน์โหลดได้ทั้งแบบแยกชีตตามห้อง หรือแบบชีตเดียวรวมทุกห้อง
                  </p>
                </div>
                <button
                  type="button"
                  onClick={deletePublishedResults}
                  disabled={busy || resultsLoading || resultExportSummary.all === 0}
                  className="app-button-pink"
                >
                  <Trash2 size={16} />
                  ลบข้อมูลประกาศผลรอบนี้
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <ExcelExportGroup
                  title="ทั้งหมด"
                  count={resultExportSummary.all}
                  roomsUrl={resultExportUrl("all", "rooms")}
                  singleUrl={resultExportUrl("all", "single")}
                />
                <ExcelExportGroup
                  title="เฉพาะผู้ผ่านเข้ารอบ"
                  count={resultExportSummary.passed}
                  roomsUrl={resultExportUrl("passed", "rooms")}
                  singleUrl={resultExportUrl("passed", "single")}
                />
                <ExcelExportGroup
                  title="เฉพาะผู้ไม่ผ่านเข้ารอบ"
                  count={resultExportSummary.failed}
                  roomsUrl={resultExportUrl("failed", "rooms")}
                  singleUrl={resultExportUrl("failed", "single")}
                />
              </div>
            </div>

            {resultsLoading ? (
              <EmptyState text="กำลังโหลดผลคะแนน" />
            ) : visibleResults.length > 0 ? (
              <ResultTable results={visibleResults} subjects={subjects} />
            ) : (
              <EmptyState text="นำเข้าคะแนนแล้วกดคำนวณ เพื่อดูคะแนนรวม อันดับ และรายชื่อผู้ผ่านเกณฑ์ก่อนประกาศผล" />
            )}
          </Panel>
        )}

        {activeTab === "line" && selectedExam && (
          <Panel icon={<Link2 size={18} />} title="LINE เช็คผลด้วยตัวเอง">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-3 text-sm text-[var(--text-muted)]">
                <div className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/line-rich-menu-preview.jpg"
                    alt="ตัวอย่าง Rich Menu LINE"
                    width={720}
                    height={486}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full"
                  />
                </div>
                <p><span className="font-semibold text-[var(--text-main)]">1. ผูกบัญชี</span> นักเรียนเปิด LIFF จาก Rich Menu แล้วกรอกรหัสนักเรียน</p>
                <p><span className="font-semibold text-[var(--text-main)]">2. ปิด LIFF อัตโนมัติ</span> หลังผูกสำเร็จ ระบบจะปิดหน้าต่างเพื่อกลับไปหน้าแชท LINE</p>
                <p><span className="font-semibold text-[var(--text-main)]">3. ดูผลคะแนน</span> กดปุ่มเช็คผลใน Rich Menu แล้วบอทจะตอบการ์ดผลคะแนนในแชท</p>
                <p><span className="font-semibold text-[var(--text-main)]">4. เช็คผลผ่านเว็บ</span> ปุ่มนี้เปิดหน้าเว็บเต็มที่ /check-result โดยตรง ไม่เปิดหน้า LIFF ย่อ</p>
                <p><span className="font-semibold text-[var(--text-main)]">5. ติดต่อโรงเรียน</span> ปุ่มนี้เปิดค่าที่ตั้งไว้ในช่องติดต่อโรงเรียนของแท็บตั้งค่า</p>
                <p><span className="font-semibold text-[var(--text-main)]">Webhook</span> ตั้งค่า LINE Developers เป็น /api/line/webhook และให้ปุ่มดูผลคะแนนส่ง postback action=check_result</p>
              </div>
              <div className="space-y-2">
                <a href={lineResultUrl} className="app-button-primary w-full" target="_blank" rel="noreferrer">
                  <Link2 size={16} />
                  เปิดลิงก์ LINE แชท bot
                </a>
                <a href={webResultUrl} className="app-button-secondary w-full" target="_blank" rel="noreferrer">
                  <Search size={16} />
                  เปิดหน้าเว็บดูคะแนน
                </a>
                <a href={schoolContactUrl} className="app-button-secondary w-full" target="_blank" rel="noreferrer">
                  <Link2 size={16} />
                  ทดสอบลิงก์ติดต่อโรงเรียน
                </a>
                <a href="/api/line/rich-menu" className="app-button-secondary w-full" target="_blank" rel="noreferrer">
                  <ListChecks size={16} />
                  ดู JSON ตั้งค่า Rich Menu
                </a>
                <button type="button" onClick={updateLineRichMenu} disabled={busy} className="app-button-pink w-full">
                  <Save size={16} />
                  อัปเดต Rich Menu ใน LINE
                </button>
              </div>
            </div>
          </Panel>
        )}
        {pendingExamAction && selectedExam && (
          <ExamActionDialog
            action={pendingExamAction}
            exam={selectedExam}
            busy={busy}
            onCancel={() => !busy && setPendingExamAction(null)}
            onConfirm={confirmExamAction}
          />
        )}
        <AppFooter />
      </div>
    </main>
  );
}

function ExamActionDialog({
  action,
  exam,
  busy,
  onCancel,
  onConfirm,
}: {
  action: ExamAction;
  exam: Exam;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isPublish = action === "publish";
  const title = isPublish ? "ยืนยันการประกาศผล" : "ยืนยันการคำนวณผล";
  const description = isPublish
    ? "ระบบจะประกาศผลให้นักเรียนสามารถเช็คคะแนนรายบุคคลได้ และสร้างแคชผลประกาศสำหรับเปิดดูอย่างรวดเร็ว"
    : "ระบบจะคำนวณคะแนนรวม อันดับ สถานะผู้ผ่าน และสร้างข้อมูลแสดงผลรายบุคคลใหม่";
  const warning = isPublish
    ? "หากรอบสอบนี้เคยประกาศแล้ว ข้อมูลประกาศและแคชผลรายบุคคลจะถูกอัปเดตใหม่"
    : "หากมีผลคำนวณเดิม ระบบจะลบผลเดิมของรอบนี้แล้วสร้างใหม่จากคะแนนล่าสุด";
  const confirmText = isPublish ? "ประกาศผล" : "คำนวณผล";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-action-dialog-title"
        className="w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-3">
          <div className={cx("grid size-11 shrink-0 place-items-center rounded-xl text-white", isPublish ? "bg-[var(--accent-pink)]" : "bg-[var(--primary-blue)]")}>
            {isPublish ? <BadgeCheck size={22} /> : <Calculator size={22} />}
          </div>
          <div className="min-w-0">
            <h2 id="exam-action-dialog-title" className="text-xl font-semibold leading-tight text-[var(--text-main)]">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-[var(--blue-wash)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="รอบสอบ" value={exam.name} />
            <Metric label="ชั้นเรียน" value={exam.classLevel} />
            <Metric label="นักเรียน" value={`${exam._count?.students ?? 0} คน`} />
            <Metric label="สถานะปัจจุบัน" value={exam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{warning}</p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="app-button-secondary justify-center">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={cx("justify-center", isPublish ? "app-button-pink" : "app-button-primary")}>
            {isPublish ? <BadgeCheck size={16} /> : <Calculator size={16} />}
            {busy ? "กำลังทำรายการ" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamContextBar({ exam }: { exam: Exam }) {
  return (
    <section className="mb-5 rounded-2xl border border-sky-100 bg-white/95 px-4 py-3 shadow-[0_12px_35px_rgba(14,165,233,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--primary-blue-strong)]">รอบสอบที่กำลังจัดการ</p>
          <h2 className="mt-1 truncate text-lg font-semibold leading-tight text-slate-950">{exam.name}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-700 ring-1 ring-sky-100">
            ระดับชั้น {exam.classLevel}
          </span>
          <span className="rounded-full bg-pink-50 px-3 py-1.5 text-pink-700 ring-1 ring-pink-100">
            {exam.selectionMode === "PER_ROOM" ? "คัดเลือกรายห้อง" : "คัดเลือกทั้งชั้น"}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-700 ring-1 ring-slate-200">
            {exam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"}
          </span>
        </div>
      </div>
    </section>
  );
}

function FilterControlGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-3 shadow-[0_8px_24px_rgba(14,165,233,0.04)]">
      <div className="mb-2 text-xs font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition",
              value === option.value
                ? "border-sky-200 bg-sky-50 text-[var(--primary-blue-strong)] shadow-sm"
                : "border-[var(--border-soft)] bg-[#fbfdff] text-[var(--text-muted)] hover:border-sky-100 hover:bg-sky-50/60",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
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

function ExcelExportGroup({
  title,
  count,
  roomsUrl,
  singleUrl,
}: {
  title: string;
  count: number;
  roomsUrl: string;
  singleUrl: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-[var(--text-main)]">{title}</p>
        <span className="rounded-full bg-[var(--pink-wash)] px-3 py-1 text-xs font-semibold text-[var(--accent-pink-strong)]">
          {count} คน
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {count > 0 ? (
          <>
            <a href={roomsUrl} className="app-button-primary justify-center">
              <Download size={16} />
              1 ไฟล์ แยกชีตตามห้อง
            </a>
            <a href={singleUrl} className="app-button-secondary justify-center">
              <Download size={16} />
              1 ไฟล์ ชีตเดียวทุกห้อง
            </a>
          </>
        ) : (
          <>
            <button type="button" className="app-button-secondary justify-center" disabled>
              <Download size={16} />
              1 ไฟล์ แยกชีตตามห้อง
            </button>
            <button type="button" className="app-button-secondary justify-center" disabled>
              <Download size={16} />
              1 ไฟล์ ชีตเดียวทุกห้อง
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--blue-wash)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
      {text}
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
