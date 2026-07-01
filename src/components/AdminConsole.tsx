"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  History,
  ImageUp,
  Link2,
  ListChecks,
  Loader2,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Table2,
  Trash2,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import { formatExamOptionLabel } from "@/lib/exam-label";
import { prepareRoomImportTable } from "@/lib/room-import-table";
import { compareRoomName } from "@/lib/room-sort";
import { countScoreDraftChanges, readScoreDraft } from "@/lib/score-draft-storage";
import { ScoreEntryCard } from "@/components/ScoreEntryCard";
import { AppFooter } from "@/components/AppFooter";
import { LogoPair } from "@/components/LogoPair";

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
  eventLogoUrl: string | null;
  showEventLogo: boolean;
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
  status: "PASSED" | "FAILED" | "REVIEW" | "ABSENT";
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
  warnings: string[];
  scoreIssues: Array<{
    rowIndex: number;
    rowNumber: number;
    subject: string;
    kind: "blank" | "zero";
  }>;
  isReady: boolean;
};
type AdminTab = "settings" | "exam" | "rooms" | "import" | "scores" | "results" | "line" | "history";

type ResultViewRow = {
  examNo: string;
  name: string;
  room: string;
  totalScore: number | null;
  rank: number | null;
  status: string | null;
  viewed: boolean;
  channel: string | null;
  viewCount: number;
  lastViewedAt: string | null;
};
type HistorySubTab = "viewed" | "notViewed";
type HistorySort = "latest" | "room" | "score" | "examNo";
type ExamAction = "calculate" | "publish";
type MaxScoreAdjustmentMode = "KEEP_SCORES" | "SCALE_SCORES";
type PendingMaxScoreChange = {
  subjectId: string;
  name: string;
  oldMaxScore: number;
  newMaxScore: number;
};
type ScoreStatRow = {
  label: string;
  count: number;
  total: number;
  average: number;
  sd: number;
};
type ScoreSummary = {
  count: number;
  scopeLabel: string;
  rows: ScoreStatRow[];
};

// เรียงรายการประวัติ: ล่าสุด / แยกห้อง / ตามคะแนน / ทั้งหมด(ตามรหัส)
function sortHistoryRows(rows: ResultViewRow[], mode: HistorySort): ResultViewRow[] {
  const byScore = (a: ResultViewRow, b: ResultViewRow) => (b.totalScore ?? -1) - (a.totalScore ?? -1);
  const byRoom = (a: ResultViewRow, b: ResultViewRow) => a.room.localeCompare(b.room, "th", { numeric: true });
  const byExamNo = (a: ResultViewRow, b: ResultViewRow) => a.examNo.localeCompare(b.examNo, "th", { numeric: true });
  const byLatest = (a: ResultViewRow, b: ResultViewRow) => (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? "");
  const arr = [...rows];
  if (mode === "latest") arr.sort((a, b) => byLatest(a, b) || byScore(a, b));
  else if (mode === "room") arr.sort((a, b) => byRoom(a, b) || byScore(a, b));
  else if (mode === "examNo") arr.sort(byExamNo);
  else arr.sort((a, b) => byScore(a, b) || byRoom(a, b));
  return arr;
}

// สร้าง CSV ประวัติ (UTF-8 BOM ให้ Excel อ่านภาษาไทยถูก) — ฝั่ง client ล้วน ไม่แตะ DB
function buildHistoryCsv(rows: ResultViewRow[]): string {
  const header = ["รหัสนักเรียน", "ชื่อ", "ห้อง", "คะแนนรวม", "อันดับ", "สถานะดู", "ช่องทาง", "จำนวนครั้ง", "เข้าดูล่าสุด"];
  const esc = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((row) =>
    [
      row.examNo,
      row.name,
      row.room,
      row.totalScore ?? "",
      row.rank ?? "",
      row.viewed ? "เข้าดูแล้ว" : "ยังไม่เข้าดู",
      row.viewed ? (row.channel === "line" ? "LINE" : "เว็บ") : "",
      row.viewed ? row.viewCount : "",
      row.viewed && row.lastViewedAt ? new Date(row.lastViewedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "",
    ]
      .map(esc)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
type ResultStatusFilter = "ALL" | CalculatedResult["status"];
type ResultSort = "rank" | "score_desc" | "score_asc" | "exam_no";
type ResultExportStatus = "all" | "passed" | "failed";
type ResultExportLayout = "rooms" | "single";

const resultStatusOptions: Array<{ value: ResultStatusFilter; label: string }> = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "PASSED", label: "ผ่านเกณฑ์" },
  { value: "REVIEW", label: "รอตรวจ" },
  { value: "FAILED", label: "ไม่ผ่าน" },
  { value: "ABSENT", label: "ไม่ได้เข้าสอบ" },
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

const richMenuSize = { width: 2500, height: 1686 };
const richMenuPreviewAreas = [
  { label: "ผูกบัญชี", x: 55, y: 500, width: 1160, height: 455 },
  { label: "ดูผลคะแนน", x: 1260, y: 500, width: 1185, height: 455 },
  { label: "เช็คผลผ่านเว็บ", x: 55, y: 975, width: 1160, height: 455 },
  { label: "ติดต่อโรงเรียน", x: 1260, y: 975, width: 1185, height: 455 },
];

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("แปลงรูป Rich Menu ไม่สำเร็จ"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("อ่านรูป Rich Menu ไม่สำเร็จ"));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function resizeRichMenuImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("เปิดรูป Rich Menu ไม่สำเร็จ"));
    });
    image.src = sourceUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = richMenuSize.width;
    canvas.height = richMenuSize.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = canvas.width / canvas.height;
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let drawX = 0;
    let drawY = 0;

    // ใช้แบบ cover เพื่อให้พื้นที่ปุ่มทั้ง 4 ตรงกับ canvas ของ LINE ไม่มีขอบว่างด้านข้าง
    if (sourceRatio > targetRatio) {
      drawHeight = canvas.height;
      drawWidth = drawHeight * sourceRatio;
      drawX = (canvas.width - drawWidth) / 2;
    } else {
      drawWidth = canvas.width;
      drawHeight = drawWidth / sourceRatio;
      drawY = (canvas.height - drawHeight) / 2;
    }

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.28];
    for (const quality of qualities) {
      const dataUrl = await canvasToJpegDataUrl(canvas, quality);
      const bytes = dataUrlByteSize(dataUrl);
      if (bytes <= 1_000_000) return { dataUrl, bytes, quality };
    }
    throw new Error("รูปยังเกิน 1MB หลัง resize กรุณาเลือกรูปที่รายละเอียดน้อยลง");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function selectNumberInput(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

function numberInputValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "";
  return String(value);
}

function parseNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AdminConsole() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [settings, setSettings] = useState({
    schoolName: "โรงเรียนตัวอย่าง",
    logoUrl: "",
    activeExamSessionId: "",
    schoolContact: "",
    adminEmail: "phanu9818@anubanubon.ac.th",
    adminPassword: "",
    adminPasswordConfirm: "",
    lineRichMenuImageUrl: "",
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoChanged, setLogoChanged] = useState(false);
  const [lineRichMenuImageChanged, setLineRichMenuImageChanged] = useState(false);
  const [lineRichMenuImageInfo, setLineRichMenuImageInfo] = useState("");
  const [lineRichMenuUploading, setLineRichMenuUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("exam");
  const [lineLinkCopied, setLineLinkCopied] = useState(false);
  const [warming, setWarming] = useState(false);
  const [pendingExamAction, setPendingExamAction] = useState<ExamAction | null>(null);

  const [newExamName, setNewExamName] = useState("สอบแข่งขันประจำปี");
  const [newClassLevel, setNewClassLevel] = useState("ป.6");
  const [newSelectionMode, setNewSelectionMode] = useState<"PER_ROOM" | "WHOLE_LEVEL">("PER_ROOM");
  const [newWholeQuota, setNewWholeQuota] = useState(10);
  const [newEventLogoUrl, setNewEventLogoUrl] = useState("");
  const [newShowEventLogo, setNewShowEventLogo] = useState(false);
  const [roomCount, setRoomCount] = useState(3);
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [editExamOpen, setEditExamOpen] = useState(false);
  const [editExamName, setEditExamName] = useState("");
  const [editClassLevel, setEditClassLevel] = useState("");
  const [editSelectionMode, setEditSelectionMode] = useState<"PER_ROOM" | "WHOLE_LEVEL">("PER_ROOM");
  const [editWholeQuota, setEditWholeQuota] = useState(0);
  const [editEventLogoUrl, setEditEventLogoUrl] = useState("");
  const [editShowEventLogo, setEditShowEventLogo] = useState(false);
  const [passTitle, setPassTitle] = useState("");
  const [passInstructions, setPassInstructions] = useState("");
  const [rooms, setRooms] = useState<RoomQuota[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([emptySubject(0)]);
  const [importRoom, setImportRoom] = useState("");
  // โหมดนำเข้า: "withScores" (แบบ 1 พร้อมคะแนน) | "roster" (แบบ 2 รายชื่อก่อน กรอกทีหลัง)
  const [importMode, setImportMode] = useState<"withScores" | "roster">("withScores");
  const [pasteText, setPasteText] = useState("");
  const [calculatedResults, setCalculatedResults] = useState<CalculatedResult[]>([]);
  const [resultsLoadedExamId, setResultsLoadedExamId] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);
  const [publicResultCacheHealth, setPublicResultCacheHealth] = useState<PublicResultCacheHealth | null>(null);
  const [cacheRepairingExamId, setCacheRepairingExamId] = useState("");
  const autoRepairStartedExamIds = useRef<Set<string>>(new Set());
  const [roomFilter, setRoomFilter] = useState("");
  const [roomBulkCount, setRoomBulkCount] = useState(14);
  const [resultRoomFilter, setResultRoomFilter] = useState("ALL");
  const [resultStatusFilter, setResultStatusFilter] = useState<ResultStatusFilter>("ALL");
  const [resultSort, setResultSort] = useState<ResultSort>("rank");
  const [resultViews, setResultViews] = useState<ResultViewRow[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsLoadedExamId, setViewsLoadedExamId] = useState("");
  const [historyTab, setHistoryTab] = useState<HistorySubTab>("viewed");
  const [viewedSort, setViewedSort] = useState<HistorySort>("latest");
  const [notViewedSort, setNotViewedSort] = useState<HistorySort>("score");
  const [excelOpen, setExcelOpen] = useState(false);
  const [pendingMaxScoreChanges, setPendingMaxScoreChanges] = useState<PendingMaxScoreChange[]>([]);
  const [maxScoreMode, setMaxScoreMode] = useState<MaxScoreAdjustmentMode>("KEEP_SCORES");
  const [maxScoreDialogError, setMaxScoreDialogError] = useState("");
  const lineResultUrl = process.env.NEXT_PUBLIC_LIFF_ID ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}` : "/line";
  // ลิงก์เพิ่มเพื่อนบัญชี LINE OA (ให้นักเรียนกดเพิ่มเพื่อนก่อนเช็คผล) — ตั้งทับได้ด้วย NEXT_PUBLIC_LINE_ADD_FRIEND_URL
  const lineAddFriendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || "https://lin.ee/OXREHbG";
  const webResultUrl = "/check-result";
  const schoolContactUrl = "/contact";

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId),
    [exams, selectedExamId],
  );
  const pasteValidation = useMemo(
    () => validateImportPreview(pasteText, subjects, importMode === "withScores"),
    [pasteText, subjects, importMode],
  );
  // ตัวอย่างตารางที่ parse จากข้อมูลที่วาง — ให้ครูดูก่อนกดยืนยันนำเข้า
  const pastePreview = useMemo(
    () => (pasteText.trim() ? prepareRoomImportTable(pasteText, subjects, importMode === "withScores") : null),
    [pasteText, subjects, importMode],
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

  const loadAdminSettings = useCallback(async () => {
    const response = await fetch("/api/admin/settings");
    if (!response.ok) return;
    const data = await response.json();
    setSettings((current) => ({
      ...current,
      schoolName: data.schoolName ?? current.schoolName,
      logoUrl: data.logoUrl ?? current.logoUrl,
      activeExamSessionId: data.activeExamSessionId ?? "",
      schoolContact: data.schoolContact ?? "",
      adminEmail: data.adminEmail ?? current.adminEmail,
      adminPassword: "",
      adminPasswordConfirm: "",
      lineRichMenuImageUrl: data.lineRichMenuImageUrl ?? current.lineRichMenuImageUrl,
    }));
    if (data.lineRichMenuImageUrl) {
      setLineRichMenuImageInfo(`ใช้ภาพที่บันทึกไว้ (${formatBytes(dataUrlByteSize(data.lineRichMenuImageUrl))})`);
    }
  }, []);

  // แถบแจ้งเตือนแสดงสักครู่แล้วหายเอง (~4.5 วิ)
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) =>
        setSettings((current) => ({
          ...current,
          schoolName: data.schoolName ?? "โรงเรียนตัวอย่าง",
          logoUrl: data.logoUrl ?? "",
          activeExamSessionId: data.activeExamSessionId ?? "",
          schoolContact: data.schoolContact ?? "",
          lineRichMenuImageUrl: data.lineRichMenuImageUrl ?? current.lineRichMenuImageUrl,
        })),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => {
        if (!response.ok) return;
        setIsLoggedIn(true);
        setSessionChecked(true);
        void loadAdminSettings();
        void loadExams();
      })
      .catch(() => undefined)
      .finally(() => setSessionChecked(true));
  }, [loadAdminSettings, loadExams]);

  // ไม่มี session (ยังไม่ล็อกอิน / ออกจากระบบ / เซสชันหมดอายุ) → กลับหน้าแรก (แท็บนักเรียน/ครู)
  // ไม่แสดงหน้า login เดี่ยว ๆ ในหลังบ้านอีกต่อไป — จุดล็อกอินเดียวคือแท็บครูในหน้าแรก
  useEffect(() => {
    if (sessionChecked && !isLoggedIn) router.replace("/");
  }, [sessionChecked, isLoggedIn, router]);

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
      const firstRoom = [...selectedExam.roomQuotas].sort((first, second) => compareRoomName(first.room, second.room))[0]?.room ?? "";
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
      setImportRoom(firstRoom);
      setEditExamOpen(false);
      setEditExamName(selectedExam.name);
      setEditClassLevel(selectedExam.classLevel);
      setEditSelectionMode(selectedExam.selectionMode);
      setEditWholeQuota(Number(selectedExam.wholeLevelQuota ?? 0));
      setEditEventLogoUrl(selectedExam.eventLogoUrl ?? "");
      setEditShowEventLogo(Boolean(selectedExam.showEventLogo && selectedExam.eventLogoUrl));
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

  const loadResultViews = useCallback(async (examSessionId: string) => {
    setViewsLoading(true);
    try {
      const response = await fetch(`/api/admin/views?examSessionId=${encodeURIComponent(examSessionId)}`);
      const data = await response.json().catch(() => ({}));
      setResultViews(response.ok && Array.isArray(data.rows) ? data.rows : []);
      setViewsLoadedExamId(examSessionId);
    } finally {
      setViewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "history" || !selectedExam || viewsLoadedExamId === selectedExam.id) return;
    queueMicrotask(() => {
      void loadResultViews(selectedExam.id);
    });
  }, [activeTab, loadResultViews, viewsLoadedExamId, selectedExam]);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ถ้าเรียกไม่สำเร็จก็ยังออกจากระบบฝั่งหน้าจอได้ (cookie หมดอายุเองอยู่แล้ว)
    }
    setIsLoggedIn(false);
    window.location.assign("/"); // กลับหน้าแรกแบบ reload เต็มหน้า เพื่อเคลียร์ state หลังบ้านใน Safari
  }

  async function saveSettings() {
    const nextAdminEmail = settings.adminEmail.trim().toLowerCase();
    const nextAdminPassword = settings.adminPassword.trim();
    const nextAdminPasswordConfirm = settings.adminPasswordConfirm.trim();

    if (!nextAdminEmail) {
      setMessage("กรุณากรอกอีเมลผู้ดูแล");
      return;
    }

    if (nextAdminPassword || nextAdminPasswordConfirm) {
      if (nextAdminPassword.length < 8) {
        setMessage("รหัสผ่านผู้ดูแลต้องมีอย่างน้อย 8 ตัวอักษร");
        return;
      }
      if (nextAdminPassword !== nextAdminPasswordConfirm) {
        setMessage("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน");
        return;
      }
    }

    setBusy(true);
    const body = {
      schoolName: settings.schoolName,
      activeExamSessionId: settings.activeExamSessionId || null,
      schoolContact: settings.schoolContact.trim() || null,
      adminEmail: nextAdminEmail,
      ...(nextAdminPassword ? { adminPassword: nextAdminPassword } : {}),
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
      ...current,
      schoolName: data.schoolName ?? current.schoolName,
      logoUrl: data.logoUrl ?? current.logoUrl,
      activeExamSessionId: data.activeExamSessionId ?? "",
      schoolContact: data.schoolContact ?? "",
      adminEmail: data.adminEmail ?? current.adminEmail,
      adminPassword: "",
      adminPasswordConfirm: "",
    }));
    setMessage("บันทึกตั้งค่าระบบแล้ว");
  }

  function readLogoFile(file: File, onLoad: (logoUrl: string) => void) {
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

      onLoad(logoUrl);
    };
    reader.readAsDataURL(file);
  }

  function uploadLogo(file: File) {
    readLogoFile(file, (logoUrl) => {
      setLogoChanged(true);
      setSettings((current) => ({ ...current, logoUrl }));
    });
  }

  function uploadNewEventLogo(file: File) {
    readLogoFile(file, (logoUrl) => {
      setNewEventLogoUrl(logoUrl);
      setNewShowEventLogo(true);
    });
  }

  function uploadEditEventLogo(file: File) {
    readLogoFile(file, (logoUrl) => {
      setEditEventLogoUrl(logoUrl);
      setEditShowEventLogo(true);
    });
  }

  async function uploadLineRichMenuImage(file: File) {
    setLineRichMenuUploading(true);
    setMessage("กำลัง resize รูป Rich Menu ให้ตรงขนาด LINE และไม่เกิน 1MB");
    try {
      const resized = await resizeRichMenuImage(file);
      setSettings((current) => ({ ...current, lineRichMenuImageUrl: resized.dataUrl }));
      setLineRichMenuImageChanged(true);
      setLineRichMenuImageInfo(`พร้อมอัปเดต: ${richMenuSize.width}×${richMenuSize.height}px · ${formatBytes(resized.bytes)} · JPEG quality ${Math.round(resized.quality * 100)}%`);
      setMessage("เตรียมรูป Rich Menu ใหม่แล้ว ตรวจตัวอย่าง 4 ปุ่มก่อนกดอัปเดต");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เตรียมรูป Rich Menu ไม่สำเร็จ");
    } finally {
      setLineRichMenuUploading(false);
    }
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
        eventLogoUrl: newEventLogoUrl || null,
        showEventLogo: newShowEventLogo,
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
    setCreateExamOpen(false);
    setNewEventLogoUrl("");
    setNewShowEventLogo(false);
    await loadExams(data.exam.id);
  }

  async function saveExamDetails() {
    if (!selectedExam) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editExamName,
        classLevel: editClassLevel,
        selectionMode: editSelectionMode,
        wholeLevelQuota: editSelectionMode === "WHOLE_LEVEL" ? editWholeQuota : null,
        passTitle,
        passInstructions,
        eventLogoUrl: editEventLogoUrl || null,
        showEventLogo: editShowEventLogo,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "แก้ไขรอบสอบไม่สำเร็จ");
      return;
    }

    if (data.rankingRuleChanged) {
      setCalculatedResults([]);
      setResultsLoadedExamId("");
      setPublicResultCacheHealth(null);
    }
    setEditExamOpen(false);
    setMessage(
      data.rankingRuleChanged
        ? "บันทึกรอบสอบแล้ว — กติกาคัดเลือกเปลี่ยน ระบบล้างผลเดิม กรุณาคำนวณและประกาศผลใหม่"
        : "บันทึกข้อมูลรอบสอบแล้ว",
    );
    await loadExams(selectedExam.id);
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
    if (!response.ok) {
      setMessage(data.error ?? "บันทึกห้องไม่สำเร็จ");
      return;
    }
    if (data.rankingRuleChanged) {
      setCalculatedResults([]);
      setResultsLoadedExamId("");
      setPublicResultCacheHealth(null);
    }
    setMessage(
      data.rankingRuleChanged
        ? "บันทึกห้องและโควตาแล้ว — ระบบล้างผลเดิม กรุณาคำนวณและประกาศผลใหม่"
        : "บันทึกห้องและโควตาแล้ว",
    );
    await loadExams(selectedExam.id);
  }

  function nextRoomNumber(currentRooms: RoomQuota[]) {
    const roomNumbers = currentRooms
      .map((room) => room.room.trim())
      .filter((room) => /^\d+$/.test(room))
      .map(Number);
    return roomNumbers.length ? Math.max(...roomNumbers) + 1 : 1;
  }

  function addSingleRoom() {
    setRooms((current) => [...current, { room: String(nextRoomNumber(current)), quota: 0 }]);
  }

  function addRoomsUntilCount() {
    const target = Math.max(1, Math.floor(roomBulkCount || 0));
    setRooms((current) => {
      const existing = new Set(current.map((room) => room.room.trim()).filter(Boolean));
      const next = [...current];
      for (let roomNumber = 1; roomNumber <= target; roomNumber += 1) {
        const roomName = String(roomNumber);
        if (!existing.has(roomName)) {
          existing.add(roomName);
          next.push({ room: roomName, quota: 0 });
        }
      }
      return next;
    });
  }

  async function saveSubjects() {
    if (!selectedExam) return;
    if ((selectedExam._count?.students ?? 0) > 0) {
      const currentById = new Map(selectedExam.subjects.map((subject) => [subject.id, subject]));
      const hasStructureChange =
        subjects.length !== selectedExam.subjects.length ||
        subjects.some((subject) => {
          if (!subject.id) return true;
          const current = currentById.get(subject.id);
          if (!current) return true;
          return subject.name.trim() !== current.name.trim() || (subject.tieBreakOrder ?? null) !== (current.tieBreakOrder ?? null);
        });

      if (hasStructureChange) {
        setMessage("มีรายชื่อนักเรียน/คะแนนแล้ว แก้ได้เฉพาะคะแนนเต็มของวิชาเดิมเท่านั้น หากต้องการเพิ่ม ลบ เปลี่ยนชื่อวิชา หรือลำดับตัดสิน กรุณาสร้างรอบสอบใหม่");
        return;
      }

      const changes = subjects
        .map((subject) => {
          const current = subject.id ? currentById.get(subject.id) : null;
          if (!current || Number(subject.maxScore) === Number(current.maxScore)) return null;
          return {
            subjectId: subject.id!,
            name: subject.name,
            oldMaxScore: Number(current.maxScore),
            newMaxScore: Number(subject.maxScore),
          };
        })
        .filter((change): change is PendingMaxScoreChange => Boolean(change));

      if (changes.length === 0) {
        setMessage("ไม่มีคะแนนเต็มที่เปลี่ยนแปลง");
        return;
      }

      setPendingMaxScoreChanges(changes);
      setMaxScoreMode("KEEP_SCORES");
      setMaxScoreDialogError("");
      return;
    }

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

  async function confirmMaxScoreChanges() {
    if (!selectedExam || pendingMaxScoreChanges.length === 0) return;
    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}/subjects/max-scores`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: maxScoreMode,
        subjects: pendingMaxScoreChanges.map((change) => ({
          subjectId: change.subjectId,
          maxScore: change.newMaxScore,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMaxScoreDialogError(data.error ?? "แก้คะแนนเต็มไม่สำเร็จ");
      return;
    }

    setPendingMaxScoreChanges([]);
    setMaxScoreDialogError("");
    setCalculatedResults([]);
    setResultsLoadedExamId("");
    setPublicResultCacheHealth(null);
    setMessage(
      maxScoreMode === "SCALE_SCORES"
        ? `แก้คะแนนเต็มและปรับคะแนนนักเรียนตามสัดส่วนแล้ว (${data.adjustedScores ?? 0} คะแนนที่อัปเดต) — กรุณาคำนวณและประกาศผลใหม่`
        : "แก้คะแนนเต็มแล้วโดยไม่เปลี่ยนคะแนนนักเรียน — กรุณาคำนวณและประกาศผลใหม่",
    );
    await loadExams(selectedExam.id);
  }

  async function importPastedRows() {
    if (!selectedExam || !importRoom) return;
    if (!pasteValidation?.isReady) {
      setMessage(pasteValidation?.errors.join(" / ") || "กรุณาตรวจข้อมูลรหัสนักเรียน ชื่อ และคะแนนก่อนนำเข้า");
      return;
    }

    const { rows } = prepareRoomImportTable(pasteText, subjects, importMode === "withScores");
    setBusy(true);
    const modeQuery = importMode === "roster" ? "?mode=roster" : "";
    const response = await fetch(`/api/exams/${selectedExam.id}/rooms/${encodeURIComponent(importRoom)}/import${modeQuery}`, {
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
    const modeQuery = importMode === "roster" ? "?mode=roster" : "";
    const response = await fetch(`/api/exams/${selectedExam.id}/rooms/${encodeURIComponent(importRoom)}/import${modeQuery}`, {
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
    const pendingDraft = readScoreDraft(selectedExam.id);
    if (pendingDraft) {
      const pendingCount = countScoreDraftChanges(pendingDraft);
      setActiveTab("scores");
      window.alert(`ยังมีคะแนนที่รอบันทึก ${pendingCount} รายการ\nกรุณารอให้ระบบบันทึกอัตโนมัติ หรือกด "ส่งคะแนนค้าง" ให้เรียบร้อยก่อน${action === "publish" ? "ประกาศผล" : "คำนวณผล"}`);
      return;
    }
    setPendingExamAction(action);
  }

  // กดคำนวณ: เช็กก่อนว่ากรอกคะแนนครบทุกคนทุกวิชาไหม — ไม่ครบ → แจ้งเตือนว่าใครขาด
  async function handleCalculateClick() {
    if (!selectedExam || busy) return;
    try {
      const response = await fetch(`/api/exams/${selectedExam.id}/scores`);
      const data = await response.json();
      if (!response.ok || !data?.subjects) {
        setMessage(data?.error ?? "โหลดข้อมูลคะแนนไม่สำเร็จ");
        return;
      }
      const subjects = data.subjects as Array<{ id: string }>;
      const students = data.students as Array<{ examNo: string; name: string; room: string; absent?: boolean; scores: Record<string, number> }>;
      if (students.length === 0) {
        setMessage("ยังไม่มีนักเรียน — นำเข้ารายชื่อก่อน");
        return;
      }
      // คนขาดสอบไม่ต้องกรอกคะแนน → ข้ามจากการเช็กครบ
      const incomplete = students.filter((student) => !student.absent && subjects.some((subject) => student.scores[subject.id] == null));
      if (incomplete.length > 0) {
        const names = incomplete.slice(0, 12).map((student) => `• ${student.examNo} ${student.name} (ห้อง ${student.room})`).join("\n");
        const more = incomplete.length > 12 ? `\n…และอีก ${incomplete.length - 12} คน` : "";
        window.alert(`ยังกรอกคะแนนไม่ครบ ${incomplete.length} คน\nกรุณากรอกคะแนนให้ครบทุกวิชาก่อนคำนวณ (แท็บ “กรอกคะแนน”):\n\n${names}${more}`);
        return;
      }
      openExamActionDialog("calculate");
    } catch {
      setMessage("เช็กความครบของคะแนนไม่สำเร็จ");
    }
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

  async function deleteExam() {
    if (!selectedExam) return;
    const confirmed = window.confirm(
      [
        `ต้องการลบรอบสอบ "${selectedExam.name}" แบบถาวรหรือไม่`,
        `จะลบทั้งหมด: วิชา ห้อง นักเรียน ${selectedExam._count?.students ?? 0} คน คะแนน ผลคำนวณ และการผูก LINE`,
        "⚠️ การลบนี้กู้คืนไม่ได้",
      ].join("\n"),
    );
    if (!confirmed) return;

    setBusy(true);
    const response = await fetch(`/api/exams/${selectedExam.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setIsLoggedIn(false);
      setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (!response.ok) {
      setMessage(data.error ?? "ลบรอบสอบไม่สำเร็จ");
      return;
    }

    const deletedName = selectedExam.name;
    setSelectedExamId("");
    setCalculatedResults([]);
    setMessage(`ลบรอบสอบ "${deletedName}" แล้ว`);
    await loadExams();
  }

  async function updateLineRichMenu() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/line/rich-menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lineRichMenuImageChanged ? { imageUrl: settings.lineRichMenuImageUrl || null } : {}),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setIsLoggedIn(false);
      setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    if (response.ok) {
      setLineRichMenuImageChanged(false);
      setLineRichMenuImageInfo(settings.lineRichMenuImageUrl ? `ใช้ภาพที่บันทึกไว้ (${formatBytes(dataUrlByteSize(settings.lineRichMenuImageUrl))})` : "กลับไปใช้ภาพ Rich Menu เริ่มต้น");
    }
    setMessage(response.ok ? "อัปเดต Rich Menu ใน LINE แล้ว" : data.error ?? "อัปเดต Rich Menu ไม่สำเร็จ");
  }

  async function warmDatabase() {
    // ปลุก Neon (free tier scale-to-zero) ก่อนกดประกาศ → คลื่นแรกของนักเรียนไม่ต้องรอ DB ตื่น
    // ยิง 2 ครั้ง: ครั้งแรกปลุก (อาจช้า) ครั้งสองวัดว่าตื่นแล้วเร็วจริง
    if (warming) return;
    setWarming(true);
    setMessage("");
    try {
      let lastMs: number | null = null;
      for (let i = 0; i < 2; i++) {
        const res = await fetch("/api/keep-warm", { headers: { Accept: "application/json" } });
        const data = await res.json().catch(() => ({}));
        if (typeof data?.warmMs === "number") lastMs = data.warmMs;
      }
      setMessage(
        lastMs != null
          ? `ปลุก DB พร้อมแล้ว ( query ล่าสุด ${lastMs} ms) — กดประกาศได้เลยภายใน ~5 นาที`
          : "ปลุก DB ไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } catch {
      setMessage("ปลุก DB ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setWarming(false);
    }
  }

  async function copyLineLink() {
    // ลิงก์เพิ่มเพื่อน OA (lin.ee/...) เป็น URL เต็มอยู่แล้ว ส่งต่อให้นักเรียนกดเพิ่มเพื่อนแล้วเช็คผลได้เลย
    try {
      await navigator.clipboard.writeText(lineAddFriendUrl);
      setLineLinkCopied(true);
      setMessage("คัดลอกลิงก์เพิ่มเพื่อน LINE แล้ว ส่งต่อให้นักเรียนได้เลย");
      setTimeout(() => setLineLinkCopied(false), 2000);
    } catch {
      setMessage(`คัดลอกอัตโนมัติไม่สำเร็จ คัดลอกลิงก์นี้เอง: ${lineAddFriendUrl}`);
    }
  }

  const visibleRooms = useMemo(
    () =>
      rooms
        .map((room, index) => ({ ...room, index }))
        .filter((room) => room.room.toLowerCase().includes(roomFilter.trim().toLowerCase()))
        .sort((first, second) => compareRoomName(first.room, second.room)),
    [roomFilter, rooms],
  );
  const sortedRooms = useMemo(
    () => [...rooms].sort((first, second) => compareRoomName(first.room, second.room)),
    [rooms],
  );
  const roomOptions = useMemo(() => {
    const values = new Set([...rooms.map((room) => room.room), ...calculatedResults.map((result) => result.room)].filter(Boolean));
    return Array.from(values).sort(compareRoomName);
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
        compareRoomName(first.room, second.room) ||
        first.rank - second.rank ||
        first.examNo.localeCompare(second.examNo, "th", { numeric: true })
      );
    });
  }, [calculatedResults, resultRoomFilter, resultSort, resultStatusFilter]);
  const visibleResultSummary = useMemo(() => {
    const passed = visibleResults.filter((result) => result.status === "PASSED").length;
    const review = visibleResults.filter((result) => result.status === "REVIEW").length;
    const failed = visibleResults.filter((result) => result.status === "FAILED").length;
    const absent = visibleResults.filter((result) => result.status === "ABSENT").length;
    return { passed, review, failed, absent, total: visibleResults.length };
  }, [visibleResults]);
  const visibleScoreSummary = useMemo(() => {
    const scoreResults = visibleResults.filter((result) => result.status !== "ABSENT" && Number.isFinite(result.totalScore));
    const scoreSubjects = subjects.filter((subject) => subject.id);
    const totalStat = scoreStat("คะแนนรวม", scoreResults.map((result) => result.totalScore));
    const subjectStats = scoreSubjects.map((subject) =>
      scoreStat(
        subject.maxScore != null ? `${subject.name} (${formatScore(subject.maxScore)})` : subject.name,
        scoreResults
          .map((result) => Number(result.scoreBreakdown[subject.id!]))
          .filter((value) => Number.isFinite(value)),
      ),
    );
    return {
      count: scoreResults.length,
      rows: [totalStat, ...subjectStats],
      scopeLabel: resultRoomFilter === "ALL" ? "ทุกห้อง" : `ห้อง ${resultRoomFilter}`,
    };
  }, [resultRoomFilter, subjects, visibleResults]);
  const resultExportSummary = useMemo(() => {
    const passed = calculatedResults.filter((result) => result.status === "PASSED").length;
    const failed = calculatedResults.filter((result) => result.status === "FAILED").length;
    return { all: calculatedResults.length, passed, failed };
  }, [calculatedResults]);

  // ยังเช็ก session ไม่เสร็จ หรือไม่ได้ล็อกอิน (กำลังเด้งกลับหน้าแรก) → แสดงตัวโหลด ไม่โชว์ฟอร์ม login
  if (!sessionChecked || !isLoggedIn) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--app-bg)] text-[var(--text-main)]">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 text-sm font-semibold text-[var(--text-muted)] shadow-[var(--shadow-soft)]">
          <Loader2 size={18} className="shrink-0 animate-spin" />
          กำลังตรวจสอบสิทธิ์...
        </div>
      </main>
    );
  }

  // ขั้นตอนการทำงานหลัก (เรียงลำดับ 1→5) + เมนูตั้งค่า (แยกกลุ่ม)
  const workflowTabs: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
    { id: "exam", label: "รอบสอบ", icon: <Megaphone size={16} /> },
    { id: "rooms", label: "ห้องและวิชา", icon: <Table2 size={16} /> },
    { id: "import", label: "นำเข้านักเรียน", icon: <ClipboardList size={16} /> },
    { id: "scores", label: "กรอกคะแนน", icon: <ListChecks size={16} /> },
    { id: "results", label: "ผลคะแนน", icon: <Calculator size={16} /> },
  ];
  const utilityTabs: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
    { id: "history", label: "ประวัติเข้าดู", icon: <History size={16} /> },
    { id: "line", label: "LINE", icon: <Link2 size={16} /> },
    { id: "settings", label: "ตั้งค่า", icon: <Settings size={16} /> },
  ];

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#eff6ff,#fdf2f8)] px-5 py-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-4">
            <LogoPair
              schoolName={settings.schoolName}
              schoolLogoUrl={settings.logoUrl}
              eventLogoUrl={selectedExam?.showEventLogo ? selectedExam.eventLogoUrl : null}
              eventName={selectedExam?.name}
              size="sm"
            />
            <div>
              <h1 className="text-2xl font-semibold">{settings.schoolName}</h1>
              <p className="text-sm text-[var(--text-muted)]">{selectedExam?.name ?? "จัดการรอบสอบและประกาศผล"}</p>
            </div>
          </div>
        </header>

        {message && (
          <div className="mb-5 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] px-4 py-3 text-sm text-[var(--accent-pink-strong)]">
            {message}
          </div>
        )}

        <nav className="mb-5 flex flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#fdf2f8)] p-2 shadow-[var(--shadow-soft)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 px-2 text-xs font-semibold text-[var(--text-muted)]">ขั้นตอน</span>
          {workflowTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                "flex min-w-max items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "bg-[linear-gradient(135deg,#38bdf8,#f472b6)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:bg-white/70",
              )}
            >
              <span className={cx("grid size-5 place-items-center rounded-full text-[11px]", activeTab === tab.id ? "bg-white/25" : "bg-white text-sky-700 ring-1 ring-sky-100")}>{index + 1}</span>
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-sky-200" />
          {utilityTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                "flex min-w-max items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
                activeTab === tab.id ? "bg-white text-pink-600 shadow-sm ring-1 ring-pink-100" : "text-[var(--text-muted)] hover:bg-white/70",
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
                  <select className="app-input app-select" value={settings.activeExamSessionId} onChange={(event) => setSettings({ ...settings, activeExamSessionId: event.target.value })}>
                    <option value="">ใช้รอบสอบที่ประกาศล่าสุด</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>{formatExamOptionLabel(exam)} · {exam.roomQuotas.length} ห้อง</option>
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
                <div className="mt-5 rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-4">
                  <h3 className="text-base font-semibold text-[var(--text-main)]">บัญชีผู้ดูแลระบบ</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    ใช้สำหรับเข้าสู่หน้าแอดมิน หากไม่ต้องการเปลี่ยนรหัสผ่านให้เว้นช่องรหัสผ่านใหม่ไว้
                  </p>
                  <div className="mt-4 grid gap-3">
                    <Field label="อีเมลผู้ดูแล">
                      <input
                        className="app-input"
                        type="email"
                        value={settings.adminEmail}
                        onChange={(event) => setSettings({ ...settings, adminEmail: event.target.value })}
                        placeholder="admin@example.com"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="รหัสผ่านใหม่">
                        <input
                          className="app-input"
                          type="password"
                          value={settings.adminPassword}
                          onChange={(event) => setSettings({ ...settings, adminPassword: event.target.value })}
                          placeholder="เว้นว่างถ้าไม่เปลี่ยน"
                        />
                      </Field>
                      <Field label="ยืนยันรหัสผ่านใหม่">
                        <input
                          className="app-input"
                          type="password"
                          value={settings.adminPasswordConfirm}
                          onChange={(event) => setSettings({ ...settings, adminPasswordConfirm: event.target.value })}
                          placeholder="กรอกซ้ำเมื่อเปลี่ยนรหัส"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
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
                <div className="mt-5 rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-4">
                  <h3 className="text-base font-semibold text-[var(--text-main)]">สำรองข้อมูล</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    ดาวน์โหลดข้อมูลทั้งหมด (นักเรียน คะแนน ผลประกาศ ตั้งค่า) เป็นไฟล์ JSON เก็บไว้เอง
                    แนะนำให้กดเก็บไว้ทุกครั้งหลังประกาศผล เผื่อข้อมูลเสียหายจะได้กู้คืนได้
                  </p>
                  <a href="/api/admin/backup" className="app-button-secondary mt-3 w-full sm:w-auto">
                    <Download size={16} />
                    ดาวน์โหลดไฟล์สำรองข้อมูล
                  </a>
                </div>
                <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
                  <button
                    type="button"
                    onClick={logout}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 sm:w-auto"
                  >
                    <LogOut size={16} />
                    ออกจากระบบ
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] p-4">
                <LogoPair schoolName={settings.schoolName} schoolLogoUrl={settings.logoUrl} size="lg" />
                <p className="mt-3 text-center text-sm font-semibold">{settings.schoolName}</p>
              </div>
            </div>
          </Panel>
        )}

        {activeTab === "exam" && (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <Panel icon={<Plus size={18} />} title="สร้างรอบสอบ">
              <button
                type="button"
                onClick={() => setCreateExamOpen((current) => !current)}
                aria-expanded={createExamOpen || exams.length === 0}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] px-4 py-3 text-left text-sm font-semibold text-[var(--text-main)]"
              >
                <span>{createExamOpen || exams.length === 0 ? "ซ่อนแบบฟอร์มสร้างรอบสอบ" : "+ สร้างรอบสอบใหม่"}</span>
                <ChevronDown size={18} className={cx("shrink-0 transition-transform", (createExamOpen || exams.length === 0) && "rotate-180")} />
              </button>
              {(createExamOpen || exams.length === 0) && (
                <div className="mt-4">
                  <Field label="ชื่อรอบสอบ">
                    <input className="app-input" value={newExamName} onChange={(event) => setNewExamName(event.target.value)} />
                  </Field>
                  <Field label="ชั้นเรียน">
                    <input className="app-input" value={newClassLevel} onChange={(event) => setNewClassLevel(event.target.value)} placeholder="เช่น ป.6" />
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
                      <input className="app-input" type="number" min={0} value={numberInputValue(newWholeQuota)} onFocus={selectNumberInput} onChange={(event) => setNewWholeQuota(parseNumberInput(event.target.value))} />
                    </Field>
                  )}
                  <Field label="จำนวนห้องในชั้น">
                    <input className="app-input" type="number" min={1} value={numberInputValue(roomCount)} onFocus={selectNumberInput} onChange={(event) => setRoomCount(parseNumberInput(event.target.value))} />
                  </Field>
                  <div className="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-3">
                    <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text-main)]">
                      <span>แสดงโลโก้งานคู่กับโลโก้โรงเรียน</span>
                      <input
                        type="checkbox"
                        className="size-4 accent-sky-500"
                        checked={newShowEventLogo}
                        onChange={(event) => setNewShowEventLogo(event.target.checked)}
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <LogoPair
                        schoolName={settings.schoolName}
                        schoolLogoUrl={settings.logoUrl}
                        eventLogoUrl={newShowEventLogo ? newEventLogoUrl : null}
                        eventName={newExamName}
                        size="sm"
                      />
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                        <ImageUp size={15} />
                        อัปโหลดโลโก้งาน
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => event.target.files?.[0] && uploadNewEventLogo(event.target.files[0])} />
                      </label>
                      {newEventLogoUrl && (
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                          onClick={() => {
                            setNewEventLogoUrl("");
                            setNewShowEventLogo(false);
                          }}
                        >
                          ลบโลโก้งาน
                        </button>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={createExam} disabled={busy} className="app-button-primary mt-4">
                    <Plus size={16} />
                    สร้างรอบสอบ
                  </button>
                </div>
              )}
            </Panel>

            <Panel icon={<Megaphone size={18} />} title="รอบสอบและการประกาศผล">
              <select className="app-input app-select" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                <option value="">เลือกรอบสอบ</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>{formatExamOptionLabel(exam)} · {exam.roomQuotas.length} ห้อง</option>
                ))}
              </select>
              {selectedExam && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {selectedExam.roomQuotas.length} ห้อง · เมื่อกรอกคะแนนครบแล้ว ไปกด <span className="font-semibold text-sky-700">คำนวณ</span> และ <span className="font-semibold text-pink-600">ประกาศผล</span> ที่แท็บ <span className="font-semibold">“ผลคะแนน”</span>
                </p>
              )}
              {selectedExam ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Metric label="ชั้นเรียน" value={selectedExam.classLevel} />
                    <Metric label="รูปแบบ" value={selectedExam.selectionMode === "PER_ROOM" ? "รายห้อง" : "ทั้งชั้น"} />
                    <Metric label="นักเรียน" value={`${selectedExam._count?.students ?? 0} คน`} />
                    <Metric label="สถานะ" value={selectedExam.status === "PUBLISHED" ? "ประกาศแล้ว" : "ฉบับร่าง"} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditExamOpen((current) => !current)}
                      disabled={busy}
                      aria-expanded={editExamOpen}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      <Pencil size={16} />
                      {editExamOpen ? "ซ่อนการแก้ไข" : "แก้ไขรอบสอบ"}
                    </button>
                    <button
                      type="button"
                      onClick={deleteExam}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      ลบรอบสอบนี้
                    </button>
                  </div>
                  {editExamOpen && (
                    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                      <div className="mb-3 flex items-center gap-2 font-semibold">
                        <Pencil size={18} />
                        แก้ไขข้อมูลรอบสอบ
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="ชื่อรอบสอบ">
                          <input className="app-input" value={editExamName} onChange={(event) => setEditExamName(event.target.value)} />
                        </Field>
                        <Field label="ชั้นเรียน">
                          <input className="app-input" value={editClassLevel} onChange={(event) => setEditClassLevel(event.target.value)} placeholder="เช่น ป.6" />
                        </Field>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {([
                          ["PER_ROOM", "รายห้อง"],
                          ["WHOLE_LEVEL", "ทั้งชั้น"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setEditSelectionMode(value)}
                            className={cx("app-segment", editSelectionMode === value && "app-segment-active")}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {editSelectionMode === "WHOLE_LEVEL" && (
                        <Field label="จำนวนผู้ผ่านทั้งชั้น">
                          <input
                            className="app-input"
                            type="number"
                            min={0}
                            value={numberInputValue(editWholeQuota)}
                            onFocus={selectNumberInput}
                            onChange={(event) => setEditWholeQuota(parseNumberInput(event.target.value))}
                          />
                        </Field>
                      )}
                      <div className="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-3">
                        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text-main)]">
                          <span>แสดงโลโก้งานคู่กับโลโก้โรงเรียน</span>
                          <input
                            type="checkbox"
                            className="size-4 accent-sky-500"
                            checked={editShowEventLogo}
                            onChange={(event) => setEditShowEventLogo(event.target.checked)}
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <LogoPair
                            schoolName={settings.schoolName}
                            schoolLogoUrl={settings.logoUrl}
                            eventLogoUrl={editShowEventLogo ? editEventLogoUrl : null}
                            eventName={editExamName}
                            size="sm"
                          />
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                            <ImageUp size={15} />
                            อัปโหลดโลโก้งาน
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => event.target.files?.[0] && uploadEditEventLogo(event.target.files[0])} />
                          </label>
                          {editEventLogoUrl && (
                            <button
                              type="button"
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                              onClick={() => {
                                setEditEventLogoUrl("");
                                setEditShowEventLogo(false);
                              }}
                            >
                              ลบโลโก้งาน
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                          ถ้าเปิดใช้งาน โลโก้งานจะแสดงคู่กับโลโก้โรงเรียนในหน้าเว็บและหน้าผลคะแนนของรอบสอบนี้
                        </p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                        เปลี่ยนรูปแบบคัดเลือกหรือจำนวนผู้ผ่านทั้งชั้น ระบบจะล้างผลที่คำนวณไว้ ต้องคำนวณและประกาศผลใหม่
                      </p>

                      <div className="mt-4 border-t border-sky-100 pt-4">
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
                            แสดงเฉพาะนักเรียนที่ผ่านการคัดเลือก · กด “บันทึกการแก้ไข” แล้วข้อความจะอัปเดตให้นักเรียนทันที (ถ้าประกาศผลรอบนี้แล้ว)
                          </p>
                        </div>
                      </div>

                      <button type="button" onClick={saveExamDetails} disabled={busy} className="app-button-primary mt-4">
                        <Save size={16} />
                        บันทึกการแก้ไข
                      </button>
                    </div>
                  )}
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
              <div className="mb-3 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
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
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-white px-2 py-2">
                  <span className="whitespace-nowrap text-xs font-semibold text-[var(--text-muted)]">สร้างถึงห้อง</span>
                  <input
                    className="app-input h-10 w-24"
                    type="number"
                    min={1}
                    value={numberInputValue(roomBulkCount)}
                    onFocus={selectNumberInput}
                    onChange={(event) => setRoomBulkCount(parseNumberInput(event.target.value))}
                  />
                  <button type="button" className="app-button-secondary h-10 px-3 text-xs" onClick={addRoomsUntilCount}>
                    สร้างห้อง
                  </button>
                </div>
                <button type="button" className="app-button-secondary" onClick={addSingleRoom}>
                  <Plus size={16} />
                  เพิ่มทีละห้อง
                </button>
              </div>
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-800">
                <span className="font-semibold">โควตาผู้ผ่าน</span> — จำนวนผู้ผ่านการคัดเลือกของห้องนั้น (เช่น 10 = ผ่าน 10 อันดับแรก) · <span className="font-semibold">ต้องมากกว่า 0</span> ไม่งั้นห้องนั้นจะไม่มีใครผ่าน
              </div>
              <div className="max-h-[460px] overflow-y-auto rounded-xl border border-[var(--border-soft)]">
                <div className="grid grid-cols-[1fr_130px_56px] gap-2 bg-[var(--blue-wash)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                  <span>ห้อง</span>
                  <span>โควตาผู้ผ่าน</span>
                  <span />
                </div>
                <div className="divide-y divide-[var(--border-soft)]">
                  {visibleRooms.map((room) => (
                    <div key={room.id ?? `room-${room.index}`} className="grid grid-cols-[1fr_130px_56px] gap-2 p-2">
                      <input className="app-input" value={room.room} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === room.index ? { ...item, room: event.target.value } : item))} />
                      <input className="app-input" type="number" min={0} value={numberInputValue(room.quota)} onFocus={selectNumberInput} onChange={(event) => setRooms(rooms.map((item, itemIndex) => itemIndex === room.index ? { ...item, quota: parseNumberInput(event.target.value) } : item))} />
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
              <div className="mb-3 space-y-1.5 rounded-xl border border-sky-100 bg-[var(--blue-wash)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
                <p><span className="font-semibold text-[var(--text-main)]">คะแนนเต็ม</span> — คะแนนเต็มของวิชานั้น ใช้คิด % และกันกรอกคะแนนเกิน</p>
                <p><span className="font-semibold text-[var(--text-main)]">ลำดับตัดสิน</span> — ใส่เลขเฉพาะวิชาที่ใช้ตัดสินเมื่อ “คะแนนรวมเท่ากัน” เลขน้อยดูก่อน (1 → 2 → 3) · เว้นว่างได้</p>
              </div>
              <div className="space-y-2.5">
                {subjects.map((subject, index) => (
                  <div key={subject.id ?? `subject-${index}`} className="rounded-xl border border-[var(--border-soft)] bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">{index + 1}</span>
                      <input className="app-input flex-1" placeholder="ชื่อวิชา เช่น คณิตศาสตร์" value={subject.name} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                      <button type="button" className="app-icon-button shrink-0" aria-label="ลบวิชา" onClick={() => setSubjects(subjects.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-8">
                      <label className="block text-xs font-medium text-[var(--text-muted)]">
                        คะแนนเต็ม
                        <input className="app-input mt-1" type="number" min={0.01} step="0.01" value={numberInputValue(subject.maxScore)} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, maxScore: parseNumberInput(event.target.value) } : item))} />
                      </label>
                      <label className="block text-xs font-medium text-[var(--text-muted)]">
                        ลำดับตัดสิน <span className="font-normal text-[10px]">(ถ้าเสมอ)</span>
                        <input className="app-input mt-1" type="number" min={1} placeholder="—" value={numberInputValue(subject.tieBreakOrder)} onFocus={selectNumberInput} onChange={(event) => setSubjects(subjects.map((item, itemIndex) => itemIndex === index ? { ...item, tieBreakOrder: event.target.value ? parseNumberInput(event.target.value) || null : null } : item))} />
                      </label>
                    </div>
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
          <Panel icon={<ClipboardList size={18} />} title="นำเข้านักเรียนทีละห้อง">
            <div className="mb-3 grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setImportMode("withScores")}
                className={cx(
                  "rounded-xl border-2 px-4 py-3 text-left transition",
                  importMode === "withScores" ? "border-sky-300 bg-[linear-gradient(135deg,#eff6ff,#f0f9ff)]" : "border-[var(--border-soft)] bg-white",
                )}
              >
                <p className="text-sm font-semibold text-sky-700">📥 แบบที่ 1 — พร้อมคะแนน</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">ไฟล์มีคะแนนทุกวิชา → ประกาศได้เลย</p>
              </button>
              <button
                type="button"
                onClick={() => setImportMode("roster")}
                className={cx(
                  "rounded-xl border-2 px-4 py-3 text-left transition",
                  importMode === "roster" ? "border-pink-300 bg-[linear-gradient(135deg,#fdf2f8,#fce7f3)]" : "border-[var(--border-soft)] bg-white",
                )}
              >
                <p className="text-sm font-semibold text-pink-700">📝 แบบที่ 2 — รายชื่อก่อน</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">รหัส+ชื่อ (ยังไม่ต้องมีคะแนน) → กรอกทีหลัง</p>
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <Field label="เลือกห้อง">
                <select className="app-input app-select" value={importRoom} onChange={(event) => setImportRoom(event.target.value)}>
                  {sortedRooms.map((room) => (
                    <option key={room.room} value={room.room}>ห้อง {room.room}</option>
                  ))}
                </select>
              </Field>
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--blue-wash)] px-4 py-3 text-sm text-[var(--text-muted)]">
                {importMode === "roster" ? (
                  <>คอลัมน์ที่ต้องมี: <span className="font-medium text-[var(--text-main)]">student_id, student_name</span> (ไม่ต้องมีคะแนน) แล้วไปกรอกคะแนนที่แท็บ &quot;กรอกคะแนน&quot;</>
                ) : (
                  <>คอลัมน์ที่ต้องมี: <span className="font-medium text-[var(--text-main)]">student_id, student_name</span> และชื่อวิชา เช่น {subjects.map((subject) => subject.name).filter(Boolean).join(", ") || "คณิตศาสตร์"} หรือวางแบบไม่มีหัวตารางตามลำดับนี้ได้</>
                )}
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
            {pasteValidation && pasteValidation.scoreIssues.length > 0 && (
              <div className="mt-3 rounded-xl border border-[var(--pink-soft)] bg-[var(--pink-wash)] px-4 py-3 text-sm text-[var(--accent-pink-strong)]">
                <p className="font-semibold">
                  พบช่องคะแนนว่างหรือเป็นศูนย์ {pasteValidation.scoreIssues.length} ช่อง กรุณาตรวจสอบก่อนยืนยันนำเข้า
                </p>
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1 text-xs leading-5">
                  {pasteValidation.scoreIssues.map((issue) => (
                    <p key={`${issue.rowIndex}-${issue.subject}-${issue.kind}`}>
                      แถว {issue.rowNumber}: วิชา {issue.subject} {issue.kind === "blank" ? "ยังไม่มีคะแนน" : "เป็น 0 คะแนน"}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {pastePreview && pastePreview.rows.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-soft)]">
                <div className="bg-[var(--blue-wash)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)]">
                  ตัวอย่างก่อนนำเข้า — {pastePreview.rows.length} แถว {pastePreview.hasHeader ? "(มีหัวตาราง)" : "(ไม่มีหัวตาราง — อ่านตามลำดับคอลัมน์)"}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fbfdff] text-xs text-[var(--text-muted)]">
                      <tr>
                        {pastePreview.headers.map((header) => (
                          <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">
                            {header === "student_id" ? "รหัสนักเรียน" : header === "student_name" ? "ชื่อ" : header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pastePreview.rows.map((row, index) => (
                        <tr key={index} className="border-t border-[var(--border-soft)]">
                          {pastePreview.headers.map((header) => {
                            const scoreIssue = pasteValidation?.scoreIssues.find(
                              (issue) => issue.rowIndex === index && issue.subject === header,
                            );
                            return (
                              <td
                                key={header}
                                className={cx(
                                  "whitespace-nowrap px-3 py-1.5",
                                  scoreIssue && "bg-[var(--pink-wash)] font-semibold text-[var(--accent-pink-strong)]",
                                )}
                              >
                                {String(row[header] ?? "") || (scoreIssue?.kind === "blank" ? "ว่าง" : "")}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="app-button-primary" onClick={importPastedRows} disabled={busy || !pasteText.trim()}>
                <ClipboardList size={16} />
                ยืนยันนำเข้าตามตัวอย่าง
              </button>
              <label className="app-button-secondary cursor-pointer">
                <UploadCloud size={16} />
                อัปโหลด Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
              </label>
            </div>
          </Panel>
        )}

        {activeTab === "scores" && selectedExam && (
          <Panel icon={<ListChecks size={18} />} title="กรอกคะแนนรายคน">
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              กรอก/แก้คะแนนแต่ละวิชาได้โดยตรง · ระบบบันทึกอัตโนมัติ และเก็บคะแนนค้างไว้ในเครื่องหากอินเทอร์เน็ตไม่พร้อม · เว้นว่าง = ยังไม่กรอก
            </p>
            <ScoreEntryCard key={selectedExam.id} examId={selectedExam.id} classLevel={selectedExam.classLevel} />
          </Panel>
        )}

        {activeTab === "results" && selectedExam && (
          <Panel icon={<ListChecks size={18} />} title="ผลคะแนน อันดับ และผู้ผ่านเกณฑ์">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#fdf2f8)] p-3">
              <button type="button" onClick={handleCalculateClick} disabled={busy} className="app-button-secondary">
                <Calculator size={16} />
                คำนวณผล
              </button>
              {(calculatedResults.length > 0 || (selectedExam._count?.resultSnapshots ?? 0) > 0) ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Check size={13} /> คำนวณแล้ว {calculatedResults.length || selectedExam._count?.resultSnapshots} รายการ
                  </span>
                  <button type="button" onClick={() => openExamActionDialog("publish")} disabled={busy} className="app-button-pink">
                    <BadgeCheck size={16} />
                    ประกาศผล
                  </button>
                </>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">กดคำนวณก่อน แล้วปุ่ม “ประกาศผล” จะปรากฏ</span>
              )}
              {selectedExam.status === "PUBLISHED" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  <Megaphone size={13} /> ประกาศแล้ว
                </span>
              )}
            </div>

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

            <div className="mb-4 grid gap-3 md:grid-cols-5">
              <Metric label="ที่แสดง" value={`${visibleResultSummary.total} คน`} />
              <Metric label="ผ่านเกณฑ์" value={`${visibleResultSummary.passed} คน`} />
              <Metric label="รอตรวจ" value={`${visibleResultSummary.review} คน`} />
              <Metric label="ไม่ผ่าน" value={`${visibleResultSummary.failed} คน`} />
              <Metric label="ไม่ได้เข้าสอบ" value={`${visibleResultSummary.absent} คน`} />
            </div>

            {resultRoomFilter === "ALL" && (
              <ResultScoreStats summary={visibleScoreSummary} placement="top" />
            )}

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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setExcelOpen((current) => !current)}
                  aria-expanded={excelOpen}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <h3 className="font-semibold text-[var(--text-main)]">ดาวน์โหลด Excel</h3>
                  <ChevronDown size={18} className={cx("shrink-0 text-[var(--text-muted)] transition-transform", excelOpen && "rotate-180")} />
                </button>
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

              {excelOpen && (
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
              )}
            </div>

            {resultsLoading ? (
              <EmptyState text="กำลังโหลดผลคะแนน" />
            ) : visibleResults.length > 0 ? (
              <ResultTable
                results={visibleResults}
                subjects={subjects}
                classLevel={selectedExam.classLevel}
                summary={resultRoomFilter === "ALL" ? null : visibleScoreSummary}
              />
            ) : (
              <EmptyState text="นำเข้าคะแนนแล้วกดคำนวณ เพื่อดูคะแนนรวม อันดับ และรายชื่อผู้ผ่านเกณฑ์ก่อนประกาศผล" />
            )}
          </Panel>
        )}

        {activeTab === "line" && selectedExam && (
          <Panel icon={<Link2 size={18} />} title="LINE เช็คผลด้วยตัวเอง">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-3 text-sm text-[var(--text-muted)]">
                <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--text-main)]">ภาพลิสต์เมนู LINE</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        ระบบตรวจพื้นที่ปุ่มครบ {richMenuPreviewAreas.length}/4 ปุ่ม และ resize เป็น {richMenuSize.width}×{richMenuSize.height}px ไม่เกิน 1MB
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700", lineRichMenuUploading && "pointer-events-none opacity-60")}>
                        <ImageUp size={15} />
                        {lineRichMenuUploading ? "กำลัง resize..." : "อัปโหลดภาพใหม่"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(event) => event.target.files?.[0] && uploadLineRichMenuImage(event.target.files[0])}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                        onClick={() => {
                          setSettings((current) => ({ ...current, lineRichMenuImageUrl: "" }));
                          setLineRichMenuImageChanged(true);
                          setLineRichMenuImageInfo("จะกลับไปใช้ภาพ Rich Menu เริ่มต้นหลังอัปเดต");
                        }}
                      >
                        ใช้ภาพเริ่มต้น
                      </button>
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-sky-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.lineRichMenuImageUrl || "/line-rich-menu-preview.jpg"}
                    alt="ตัวอย่าง Rich Menu LINE"
                    width={720}
                    height={486}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full"
                  />
                    <div className="pointer-events-none absolute inset-0">
                      {richMenuPreviewAreas.map((area, index) => (
                        <div
                          key={area.label}
                          className="absolute rounded-lg border-2 border-white/95 bg-sky-500/10 shadow-[0_0_0_1px_rgba(2,132,199,0.55)]"
                          style={{
                            left: `${(area.x / richMenuSize.width) * 100}%`,
                            top: `${(area.y / richMenuSize.height) * 100}%`,
                            width: `${(area.width / richMenuSize.width) * 100}%`,
                            height: `${(area.height / richMenuSize.height) * 100}%`,
                          }}
                        >
                          <span className="absolute left-2 top-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                            {index + 1}. {area.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    ตรวจพบพื้นที่ปุ่มครบ 4 ปุ่ม: ผูกบัญชี, ดูผลคะแนน, เช็คผลผ่านเว็บ, ติดต่อโรงเรียน
                    {lineRichMenuImageInfo ? ` · ${lineRichMenuImageInfo}` : ""}
                  </div>
                </div>
                <p><span className="font-semibold text-[var(--text-main)]">1. ผูกบัญชี</span> นักเรียนเปิด LIFF จาก Rich Menu แล้วกรอกรหัสนักเรียน</p>
                <p><span className="font-semibold text-[var(--text-main)]">2. ปิด LIFF อัตโนมัติ</span> หลังผูกสำเร็จ ระบบจะปิดหน้าต่างเพื่อกลับไปหน้าแชท LINE</p>
                <p><span className="font-semibold text-[var(--text-main)]">3. ดูผลคะแนน</span> กดปุ่มเช็คผลใน Rich Menu แล้วบอทจะตอบการ์ดผลคะแนนในแชท</p>
                <p><span className="font-semibold text-[var(--text-main)]">4. เช็คผลผ่านเว็บ</span> ปุ่มนี้เปิด LIFF เพื่อตรวจบัญชีที่ผูกไว้ แล้วพาไปหน้าเว็บเต็มของผลคะแนนทันที</p>
                <p><span className="font-semibold text-[var(--text-main)]">5. ติดต่อโรงเรียน</span> ปุ่มนี้เปิดค่าที่ตั้งไว้ในช่องติดต่อโรงเรียนของแท็บตั้งค่า</p>
                <p><span className="font-semibold text-[var(--text-main)]">Webhook</span> ตั้งค่า LINE Developers เป็น /api/line/webhook และให้ปุ่มดูผลคะแนนส่ง postback action=check_result</p>
              </div>
              <div className="space-y-2">
                <button type="button" onClick={warmDatabase} disabled={warming} className="app-button-pink w-full">
                  <Zap size={16} />
                  {warming ? "กำลังปลุก DB..." : "ปลุก DB เตรียมประกาศ (กดก่อนแจ้งนักเรียน)"}
                </button>
                <button type="button" onClick={copyLineLink} className="app-button-primary w-full">
                  {lineLinkCopied ? <Check size={16} /> : <Copy size={16} />}
                  {lineLinkCopied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์เพิ่มเพื่อน LINE ให้นักเรียน"}
                </button>
                <a href={lineResultUrl} className="app-button-secondary w-full" target="_blank" rel="noreferrer">
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
                <button type="button" onClick={updateLineRichMenu} disabled={busy || lineRichMenuUploading || richMenuPreviewAreas.length !== 4} className="app-button-pink w-full">
                  <Save size={16} />
                  อัปเดต Rich Menu ใน LINE
                </button>
              </div>
            </div>
          </Panel>
        )}
        {activeTab === "history" && selectedExam && (
          <Panel icon={<History size={18} />} title="ประวัติการเข้าดูผลคะแนน">
            {viewsLoading ? (
              <EmptyState text="กำลังโหลดประวัติ" />
            ) : resultViews.length === 0 ? (
              <EmptyState text="ยังไม่มีรายชื่อนักเรียน — นำเข้ารายชื่อและประกาศผลก่อน" />
            ) : (() => {
              const viewed = resultViews.filter((row) => row.viewed);
              const notViewed = resultViews.filter((row) => !row.viewed);
              const lineCount = viewed.filter((row) => row.channel === "line").length;
              const isViewedTab = historyTab === "viewed";
              const sortValue = isViewedTab ? viewedSort : notViewedSort;
              const sortOptions = isViewedTab
                ? [
                    { value: "latest", label: "ล่าสุด" },
                    { value: "room", label: "แยกห้อง" },
                    { value: "score", label: "เรียงตามคะแนน" },
                  ]
                : [
                    { value: "score", label: "เรียงตามคะแนน" },
                    { value: "room", label: "แยกห้อง" },
                    { value: "examNo", label: "ทั้งหมด" },
                  ];
              const rows = sortHistoryRows(isViewedTab ? viewed : notViewed, sortValue);
              return (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    <Metric label="เข้าดูแล้ว" value={`${viewed.length}/${resultViews.length}`} />
                    <Metric label="ผ่าน LINE" value={`${lineCount} คน`} />
                    <Metric label="ผ่านเว็บ" value={`${viewed.length - lineCount} คน`} />
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--blue-wash)] p-1">
                    <button
                      type="button"
                      onClick={() => setHistoryTab("viewed")}
                      className={cx("rounded-lg px-3 py-2 text-sm font-semibold transition", isViewedTab ? "bg-white text-sky-700 shadow-sm" : "text-[var(--text-muted)]")}
                    >
                      เข้าดูแล้ว ({viewed.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab("notViewed")}
                      className={cx("rounded-lg px-3 py-2 text-sm font-semibold transition", !isViewedTab ? "bg-white text-pink-600 shadow-sm" : "text-[var(--text-muted)]")}
                    >
                      ยังไม่เข้าดู ({notViewed.length})
                    </button>
                  </div>

                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div className="max-w-xs grow">
                      <FilterControlGroup
                        label="เรียงลำดับ"
                        value={sortValue}
                        options={sortOptions}
                        onChange={(value) => (isViewedTab ? setViewedSort : setNotViewedSort)(value as HistorySort)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          `ประวัติเข้าดูผล-${isViewedTab ? "เข้าดูแล้ว" : "ยังไม่เข้าดู"}-${selectedExam.classLevel}.csv`,
                          buildHistoryCsv(rows),
                        )
                      }
                      disabled={rows.length === 0}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      <Download size={16} />
                      CSV
                    </button>
                  </div>

                  {rows.length === 0 ? (
                    <EmptyState text={isViewedTab ? "ยังไม่มีใครเข้าดูผล" : "ทุกคนเข้าดูผลแล้ว 🎉"} />
                  ) : (
                    <div className="grid gap-2">
                      {rows.map((row) => (
                        <div key={row.examNo} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-soft)] bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{row.name}</p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              รหัส {row.examNo} · {selectedExam.classLevel}/{row.room}
                              {row.totalScore != null && ` · ${formatScore(row.totalScore)} คะแนน`}
                              {row.rank != null && row.rank > 0 && ` · อันดับ ${row.rank}`}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {row.viewed ? (
                              <>
                                <span className={cx("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", row.channel === "line" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700")}>
                                  {row.channel === "line" ? "LINE" : "เว็บ"}
                                </span>
                                <p className="mt-1 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                                  {row.viewCount} ครั้ง · {row.lastViewedAt ? new Date(row.lastViewedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                                </p>
                              </>
                            ) : (
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">ยังไม่เข้าดู</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </Panel>
        )}
        {pendingMaxScoreChanges.length > 0 && (
          <MaxScoreAdjustmentDialog
            changes={pendingMaxScoreChanges}
            mode={maxScoreMode}
            error={maxScoreDialogError}
            busy={busy}
            onModeChange={(mode) => {
              setMaxScoreMode(mode);
              setMaxScoreDialogError("");
            }}
            onCancel={() => {
              if (busy) return;
              setPendingMaxScoreChanges([]);
              setMaxScoreDialogError("");
            }}
            onConfirm={confirmMaxScoreChanges}
          />
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

function MaxScoreAdjustmentDialog({
  changes,
  mode,
  error,
  busy,
  onModeChange,
  onCancel,
  onConfirm,
}: {
  changes: PendingMaxScoreChange[];
  mode: MaxScoreAdjustmentMode;
  error: string;
  busy: boolean;
  onModeChange: (mode: MaxScoreAdjustmentMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="max-score-dialog-title"
        className="w-full max-w-2xl rounded-2xl border border-[var(--border-soft)] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--primary-blue)] text-white">
            <BookOpen size={22} />
          </div>
          <div className="min-w-0">
            <h2 id="max-score-dialog-title" className="text-xl font-semibold leading-tight text-[var(--text-main)]">
              ยืนยันการแก้คะแนนเต็ม
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              รอบสอบนี้มีคะแนนนักเรียนแล้ว เลือกวิธีจัดการคะแนนเดิมก่อนบันทึก ระบบจะล้างผลคำนวณ/ประกาศเดิมและให้คำนวณใหม่
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-soft)]">
          <div className="grid grid-cols-[1fr_100px_100px] gap-2 bg-[var(--blue-wash)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)]">
            <span>วิชา</span>
            <span className="text-right">เดิม</span>
            <span className="text-right">ใหม่</span>
          </div>
          <div className="divide-y divide-[var(--border-soft)]">
            {changes.map((change) => (
              <div key={change.subjectId} className="grid grid-cols-[1fr_100px_100px] gap-2 px-4 py-3 text-sm">
                <span className="font-semibold text-[var(--text-main)]">{change.name}</span>
                <span className="text-right text-[var(--text-muted)]">{formatScore(change.oldMaxScore)}</span>
                <span className="text-right font-semibold text-[var(--accent-pink-strong)]">{formatScore(change.newMaxScore)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange("SCALE_SCORES")}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition",
              mode === "SCALE_SCORES"
                ? "border-sky-300 bg-sky-50 shadow-[0_12px_28px_rgba(14,165,233,0.12)]"
                : "border-[var(--border-soft)] bg-white hover:bg-sky-50/60",
            )}
          >
            <span className="text-sm font-semibold text-[var(--text-main)]">ปรับคะแนนตามสัดส่วน</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
              เช่น 24/30 เมื่อเปลี่ยนเต็มเป็น 50 จะกลายเป็น 40.00/50
            </span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange("KEEP_SCORES")}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition",
              mode === "KEEP_SCORES"
                ? "border-pink-300 bg-pink-50 shadow-[0_12px_28px_rgba(244,114,182,0.12)]"
                : "border-[var(--border-soft)] bg-white hover:bg-pink-50/60",
            )}
          >
            <span className="text-sm font-semibold text-[var(--text-main)]">ไม่แก้คะแนนนักเรียน</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
              ระบบจะบันทึกเฉพาะเมื่อคะแนนเต็มใหม่ไม่น้อยกว่าคะแนนนักเรียนที่มีอยู่
            </span>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="app-button-secondary justify-center">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="app-button-primary justify-center">
            <Save size={16} />
            {busy ? "กำลังบันทึก" : "ยืนยันแก้คะแนนเต็ม"}
          </button>
        </div>
      </div>
    </div>
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
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">{label}</span>
      <select className="app-input app-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function validateImportPreview(text: string, subjects: Subject[], requireScores = true): ImportValidation | null {
  if (!text.trim()) return null;

  const parsed = prepareRoomImportTable(text, subjects, requireScores);
  const activeSubjects = subjects.filter((subject) => subject.name.trim());
  const errors: string[] = [];
  const warnings: string[] = [];
  const scoreIssues: ImportValidation["scoreIssues"] = [];
  const studentIdColumn = findColumn(parsed.headers, ["student_id", "รหัสนักเรียน", "exam_no", "เลขประจำตัว", "เลขที่สอบ", "รหัสสอบ"]);
  const studentNameColumn = findColumn(parsed.headers, ["student_name", "ชื่อนักเรียน", "ชื่อ-สกุล", "ชื่อ", "name"]);
  const seenStudentIds = new Set<string>();
  let scoreCellCount = 0;

  if (!studentIdColumn) errors.push("ไม่พบคอลัมน์ student_id หรือ รหัสนักเรียน");
  if (!studentNameColumn) errors.push("ไม่พบคอลัมน์ student_name หรือ ชื่อนักเรียน");
  // โหมดบังคับคะแนน: ต้องมีวิชา + คอลัมน์คะแนนครบ · โหมด roster: ข้าม (กรอกทีหลัง)
  if (requireScores && activeSubjects.length === 0) errors.push("ต้องสร้างวิชาก่อนตรวจข้อมูลนำเข้า");
  if (parsed.rows.length === 0) errors.push("ไม่พบข้อมูลนักเรียน");

  if (requireScores) {
    for (const subject of activeSubjects) {
      if (!parsed.headers.includes(subject.name)) {
        errors.push(`ไม่พบคอลัมน์วิชา ${subject.name}`);
      }
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
      const scoreText = String(rawScore ?? "").trim();
      if (!scoreText) {
        if (requireScores) {
          const message = `แถว ${rowNumber}: คะแนนวิชา ${subject.name} ยังว่าง`;
          errors.push(message);
          scoreIssues.push({ rowIndex: index, rowNumber, subject: subject.name, kind: "blank" });
        }
        continue;
      }
      const score = Number(rawScore);
      if (!Number.isFinite(score)) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} ไม่ใช่ตัวเลข`);
      } else if (score < 0) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} ต้องไม่ติดลบ`);
      } else if (subject.maxScore != null && score > subject.maxScore) {
        errors.push(`แถว ${rowNumber}: คะแนนวิชา ${subject.name} เกินคะแนนเต็ม ${subject.maxScore}`);
      } else {
        if (score === 0) {
          const message = `แถว ${rowNumber}: คะแนนวิชา ${subject.name} เป็น 0 คะแนน`;
          warnings.push(message);
          scoreIssues.push({ rowIndex: index, rowNumber, subject: subject.name, kind: "zero" });
        }
        scoreCellCount += 1;
      }
    }
  });

  return {
    rowCount: parsed.rows.length,
    subjectCount: activeSubjects.length,
    scoreCellCount,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    scoreIssues,
    isReady: errors.length === 0,
  };
}

function formatScore(value: number | undefined) {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function scoreStat(label: string, values: number[]): ScoreStatRow {
  const validValues = values.filter((value) => Number.isFinite(value));
  const count = validValues.length;
  const total = validValues.reduce((sum, value) => sum + value, 0);
  const average = count > 0 ? total / count : 0;
  const variance = count > 0
    ? validValues.reduce((sum, value) => sum + (value - average) ** 2, 0) / count
    : 0;
  return { label, count, total, average, sd: Math.sqrt(variance) };
}

function statusLabel(status: CalculatedResult["status"]) {
  if (status === "PASSED") return "ผ่าน";
  if (status === "REVIEW") return "รอตรวจ";
  if (status === "ABSENT") return "ไม่ได้เข้าสอบ";
  return "ไม่ผ่าน";
}

function ResultScoreStats({ summary, placement }: { summary: ScoreSummary; placement: "top" | "bottom" }) {
  return (
    <section className={cx(
      "rounded-2xl border border-sky-100 bg-white p-4 shadow-[0_12px_32px_rgba(14,165,233,0.08)]",
      placement === "top" ? "mb-4" : "mt-4",
    )}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[var(--text-main)]">สถิติคะแนน {summary.scopeLabel}</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            คำนวณจากนักเรียนที่เข้าสอบในชุดที่แสดง {summary.count} คน
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-soft)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--blue-wash)] text-xs font-semibold text-[var(--text-muted)]">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">รายการ</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">จำนวน</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">รวมคะแนน</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">ค่าเฉลี่ย</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">SD</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.label} className="border-t border-[var(--border-soft)]">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--text-main)]">{row.label}</td>
                <td className="px-3 py-2 text-center">{row.count}</td>
                <td className="px-3 py-2 text-center">{formatScore(row.total)}</td>
                <td className="px-3 py-2 text-center">{formatScore(row.average)}</td>
                <td className="px-3 py-2 text-center">{formatScore(row.sd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultTable({ results, subjects, classLevel, summary }: { results: CalculatedResult[]; subjects: Subject[]; classLevel: string; summary?: ScoreSummary | null }) {
  const scoreSubjects = subjects.filter((subject) => subject.id);
  // คะแนนเต็มรวม (แสดงในวงเล็บที่หัวคอลัมน์ "คะแนนรวม")
  const totalMax = scoreSubjects.every((subject) => subject.maxScore != null)
    ? scoreSubjects.reduce((sum, subject) => sum + (subject.maxScore ?? 0), 0)
    : null;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--blue-wash)] text-[var(--text-muted)]">
            <tr>
              {[
                "อันดับ",
                "รหัสนักเรียน",
                "ชื่อ",
                "ห้อง",
                ...scoreSubjects.map((subject) => (subject.maxScore != null ? `${subject.name} (${subject.maxScore})` : subject.name)),
                totalMax != null ? `คะแนนรวม (${totalMax})` : "คะแนนรวม",
                "สถานะ",
                "เหตุผล",
              ].map((header) => (
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
                <td className="whitespace-nowrap px-3 py-2">{classLevel}/{result.room}</td>
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
      {summary && <ResultScoreStats summary={summary} placement="bottom" />}
    </>
  );
}
