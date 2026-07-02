import { getPrisma } from "@/lib/prisma";
import { calculateResults } from "@/lib/ranking";
import { hashPassword, signLineResultWebToken, verifierHash } from "@/lib/security";
import type { LineResultWebLookup } from "@/lib/security";
import type { Prisma } from "@prisma/client";
import type { ImportedStudentRow } from "@/lib/excel";
import type { CandidateInput, RankingRule, SubjectInput } from "@/lib/types";

export type PublicStudentResult = {
  school: {
    schoolName: string;
    examTitle: string;
    logoUrl?: string | null;
    schoolContact?: string | null;
  };
  exam: {
    id: string;
    name: string;
    classLevel: string;
    selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
    publishedAt: string | null;
    passTitle: string | null;
    passInstructions: string | null;
    eventLogoUrl?: string | null;
    showEventLogo?: boolean;
    scoreDisplayMode?: "RAW" | "PERCENT";
  };
  student: {
    examNo: string;
    name: string;
    classLevel: string;
    room: string;
  };
  result: {
    rank: number;
    totalScore: number;
    status: "PASSED" | "FAILED" | "REVIEW" | "ABSENT";
    reason: string;
    scoreBreakdown: Record<string, number>;
  };
  statistics: {
    total: {
      score: number;
      // คะแนนเต็มรวม (= ผลรวม maxScore ทุกวิชา) ใช้คิด % เพื่อแบ่งช่วงคะแนน
      // optional เผื่อ snapshot เก่าที่แคชไว้ก่อนเพิ่ม field นี้ (ยังไม่ rebuild)
      maxScore?: number;
      roomAverage: number;
      levelAverage: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    };
    subjects: Array<{
      id: string;
      name: string;
      score: number;
      maxScore?: number;
      roomAverage: number;
      levelAverage: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    }>;
  };
};

export type PublicStudentResultLookup = {
  examNo: string;
  studentId?: string;
  examSessionId?: string;
};

export type PublishedStudentResultSession = {
  lookup: Required<PublicStudentResultLookup>;
  result: PublicStudentResult;
};

export type PublishedStudentResultCacheMiss = {
  lookup: Required<PublicStudentResultLookup>;
  result: null;
  cacheMissing: true;
};

export type PublishedStudentResultLookupResult =
  | PublishedStudentResultSession
  | PublishedStudentResultCacheMiss;

type ResultStudent = {
  id: string;
  examNo: string;
  name: string;
  classLevel: string;
  room: string;
  examSession: {
    id: string;
    name: string;
    classLevel: string;
    selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
    publishedAt: Date | null;
    passTitle: string | null;
    passInstructions: string | null;
    eventLogoUrl: string | null;
    showEventLogo: boolean;
    scoreDisplayMode: string;
    subjects: Array<{ id: string; name: string }>;
  };
  resultSnapshots: Array<{
    examSessionId: string;
    rank: number;
    totalScore: number;
    status: "PASSED" | "FAILED" | "REVIEW" | "ABSENT";
    reason: string;
    scoreBreakdown: unknown;
  }>;
};

type PeerResultSnapshot = {
  studentId: string;
  totalScore: number;
  scoreBreakdown: unknown;
  student: {
    room: string;
    examNo: string;
  };
};

type PublicResultSnapshotInput = {
  studentId: string;
  rank: number;
  totalScore: number;
  status: "PASSED" | "FAILED" | "REVIEW" | "ABSENT";
  reason: string;
  scoreBreakdown: unknown;
  student: {
    examNo: string;
    name: string;
    classLevel: string;
    room: string;
  };
};

type PublicResultExamInput = {
  id: string;
  name: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  publishedAt: Date | null;
  passTitle: string | null;
  passInstructions: string | null;
  eventLogoUrl: string | null;
  showEventLogo: boolean;
  scoreDisplayMode: string;
  subjects: Array<{ id: string; name: string; maxScore: number | null }>;
};

export type SubjectMaxScoreAdjustmentMode = "KEEP_SCORES" | "SCALE_SCORES";

const peerSnapshotMemoryCache = new Map<string, { expiresAt: number; data: PeerResultSnapshot[] }>();
const peerSnapshotCacheMs = 60_000;
const activePublishedExamMemoryCache = new Map<
  string,
  { expiresAt: number; data: Awaited<ReturnType<typeof getActivePublishedExamIdUncached>> }
>();
const activePublishedExamCacheMs = 30_000;

// SchoolSettings ถูกอ่านในแทบทุก request (LINE + เว็บ + auth) แต่เปลี่ยนนาน ๆ ครั้ง
// แคชในหน่วยความจำ (per-isolate) สั้น ๆ ลดทั้ง query และ "write บนเส้นทางอ่าน" (เดิม upsert ทุกครั้ง)
let schoolSettingsMemoryCache: { expiresAt: number; data: Awaited<ReturnType<typeof loadSchoolSettings>> } | null = null;
const schoolSettingsCacheMs = 30_000;

function clearSchoolSettingsCache() {
  schoolSettingsMemoryCache = null;
}

type ResultLookupTrace = {
  mark: (label: string, extra?: Record<string, unknown>) => void;
  done: (outcome: string, extra?: Record<string, unknown>) => void;
};

function clearActivePublishedExamCache() {
  activePublishedExamMemoryCache.clear();
}

export function scaleScoreToMaxScore(value: number, oldMaxScore: number, newMaxScore: number) {
  if (!Number.isFinite(value) || !Number.isFinite(oldMaxScore) || !Number.isFinite(newMaxScore) || oldMaxScore <= 0 || newMaxScore <= 0) {
    throw new Error("ข้อมูลคะแนนเต็มไม่ถูกต้อง");
  }
  return Math.round((value * newMaxScore / oldMaxScore) * 100) / 100;
}

function startResultLookupTrace(scope: string, input: PublicStudentResultLookup): ResultLookupTrace | null {
  if (process.env.RESULT_LOOKUP_DEBUG !== "1") return null;

  const startedAt = Date.now();
  let previousAt = startedAt;
  const marks: Array<Record<string, unknown>> = [];
  const safeInput = {
    hasStudentId: Boolean(input.studentId),
    hasExamSessionId: Boolean(input.examSessionId),
    examNoLength: input.examNo.trim().length,
  };

  return {
    mark(label, extra = {}) {
      const now = Date.now();
      marks.push({
        label,
        elapsedMs: now - startedAt,
        deltaMs: now - previousAt,
        ...extra,
      });
      previousAt = now;
    },
    done(outcome, extra = {}) {
      const finishedAt = Date.now();
      console.info("[result-lookup]", {
        scope,
        outcome,
        region: process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_REGION || "local",
        totalMs: finishedAt - startedAt,
        input: safeInput,
        marks,
        ...extra,
      });
    },
  };
}

export async function upsertSchoolSettings(input: {
  schoolName: string;
  examTitle?: string;
  logoUrl?: string | null;
  activeExamSessionId?: string | null;
  schoolContact?: string | null;
  adminEmail?: string | null;
  adminPasswordHash?: string | null;
  lineRichMenuImageUrl?: string | null;
}) {
  const prisma = getPrisma();
  const settings = await prisma.schoolSettings.upsert({
    where: { id: "main" },
    update: input,
    create: { id: "main", ...input },
  });
  clearActivePublishedExamCache();
  clearSchoolSettingsCache();
  return settings;
}

async function loadSchoolSettings() {
  const prisma = getPrisma();
  // อ่านอย่างเดียว (findUnique) — เดิมใช้ upsert ซึ่งเป็น write ทุกครั้งบนเส้นทางอ่าน
  const existing = await prisma.schoolSettings.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  // ยังไม่มีแถว (รันครั้งแรกเท่านั้น) ค่อยสร้าง
  return prisma.schoolSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
}

export async function getSchoolSettings() {
  if (schoolSettingsMemoryCache && schoolSettingsMemoryCache.expiresAt > Date.now()) {
    return schoolSettingsMemoryCache.data;
  }
  const data = await loadSchoolSettings();
  schoolSettingsMemoryCache = { expiresAt: Date.now() + schoolSettingsCacheMs, data };
  return data;
}

export async function getAdminCredentials() {
  const settings = await getSchoolSettings();
  return {
    email: (settings.adminEmail || process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase(),
    passwordHash: settings.adminPasswordHash || hashPassword(process.env.ADMIN_PASSWORD || "admin1234"),
  };
}

export async function getPublicResultSettings() {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const activeExam = settings.activeExamSessionId
    ? await prisma.examSession.findUnique({
        where: { id: settings.activeExamSessionId },
        select: { id: true, name: true, classLevel: true, status: true, publishedAt: true, eventLogoUrl: true, showEventLogo: true, scoreDisplayMode: true },
      })
    : await prisma.examSession.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { id: true, name: true, classLevel: true, status: true, publishedAt: true, eventLogoUrl: true, showEventLogo: true, scoreDisplayMode: true },
      });

  return {
    id: settings.id,
    schoolName: settings.schoolName,
    examTitle: settings.examTitle,
    logoUrl: publicLogoUrl(settings.logoUrl),
    activeExamSessionId: settings.activeExamSessionId,
    schoolContact: settings.schoolContact,
    updatedAt: settings.updatedAt,
    activeExam: activeExam
      ? {
          ...activeExam,
          eventLogoUrl: publicExamLogoUrl(activeExam.id, activeExam.eventLogoUrl, activeExam.showEventLogo),
        }
      : null,
  };
}

export async function createExamSession(input: {
  name: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  wholeLevelQuota?: number | null;
  eventLogoUrl?: string | null;
  showEventLogo?: boolean;
  rooms: Array<{ room: string; quota: number }>;
}) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const exam = await tx.examSession.create({
      data: {
        name: input.name,
        classLevel: input.classLevel,
        selectionMode: input.selectionMode,
        wholeLevelQuota: input.selectionMode === "WHOLE_LEVEL" ? Number(input.wholeLevelQuota ?? 0) : null,
        eventLogoUrl: input.eventLogoUrl?.trim() || null,
        showEventLogo: Boolean(input.showEventLogo && input.eventLogoUrl?.trim()),
      },
    });

    if (input.rooms.length > 0) {
      await tx.roomQuota.createMany({
        data: input.rooms.map((room) => ({
          examSessionId: exam.id,
          room: room.room,
          quota: Number(room.quota || 0),
        })),
      });
    }

    return exam;
  });
}

// แก้ไขข้อมูลรอบสอบ (ชื่อ/ชั้น/รูปแบบคัดเลือก/โควตารวม) — เปลี่ยนกติกาจัดอันดับแล้วล้างผลเก่า
export async function updateExamSession(input: {
  examSessionId: string;
  name?: string;
  classLevel?: string;
  selectionMode?: "PER_ROOM" | "WHOLE_LEVEL";
  wholeLevelQuota?: number | null;
  passTitle?: string | null;
  passInstructions?: string | null;
  eventLogoUrl?: string | null;
  showEventLogo?: boolean;
  scoreDisplayMode?: string;
}) {
  const prisma = getPrisma();
  const current = await prisma.examSession.findUnique({
    where: { id: input.examSessionId },
    select: { id: true, name: true, classLevel: true, selectionMode: true, wholeLevelQuota: true, eventLogoUrl: true },
  });
  if (!current) throw new Error("ไม่พบรอบสอบ");

  const name = input.name?.trim();
  const classLevel = input.classLevel?.trim();
  if (input.name !== undefined && !name) throw new Error("กรุณากรอกชื่อรอบสอบ");
  if (input.classLevel !== undefined && !classLevel) throw new Error("กรุณากรอกชั้นเรียน");

  const nextName = name || current.name;
  const nextClassLevel = classLevel || current.classLevel;
  if (input.name !== undefined || input.classLevel !== undefined) {
    const duplicate = await prisma.examSession.findFirst({
      where: { id: { not: input.examSessionId }, name: nextName, classLevel: nextClassLevel },
      select: { id: true },
    });
    if (duplicate) throw new Error("มีรอบสอบชื่อนี้ในชั้นนี้แล้ว");
  }

  const nextSelectionMode = input.selectionMode ?? current.selectionMode;
  const nextWholeLevelQuota =
    nextSelectionMode === "WHOLE_LEVEL"
      ? Number(input.wholeLevelQuota ?? current.wholeLevelQuota ?? 0)
      : null;
  // เปลี่ยนรูปแบบคัดเลือก/โควตารวม = กติกาจัดอันดับเปลี่ยน → ผลเก่าใช้ไม่ได้
  const rankingRuleChanged =
    nextSelectionMode !== current.selectionMode || nextWholeLevelQuota !== current.wholeLevelQuota;
  const classLevelChanged = nextClassLevel !== current.classLevel;
  const nextEventLogoUrl =
    input.eventLogoUrl !== undefined ? input.eventLogoUrl?.trim() || null : current.eventLogoUrl;
  const nextShowEventLogo =
    input.showEventLogo !== undefined || input.eventLogoUrl !== undefined
      ? Boolean(input.showEventLogo && nextEventLogoUrl)
      : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const exam = await tx.examSession.update({
      where: { id: input.examSessionId },
      data: {
        ...(name ? { name } : {}),
        ...(classLevel ? { classLevel } : {}),
        ...(input.selectionMode ? { selectionMode: nextSelectionMode } : {}),
        ...(input.selectionMode || input.wholeLevelQuota !== undefined
          ? { wholeLevelQuota: nextWholeLevelQuota }
          : {}),
        ...(input.passTitle !== undefined ? { passTitle: input.passTitle?.trim() || null } : {}),
        ...(input.passInstructions !== undefined ? { passInstructions: input.passInstructions?.trim() || null } : {}),
        ...(input.eventLogoUrl !== undefined ? { eventLogoUrl: nextEventLogoUrl } : {}),
        ...(nextShowEventLogo !== undefined ? { showEventLogo: nextShowEventLogo } : {}),
        ...(input.scoreDisplayMode !== undefined
          ? { scoreDisplayMode: input.scoreDisplayMode === "PERCENT" ? "PERCENT" : "RAW" }
          : {}),
        ...(rankingRuleChanged ? { status: "DRAFT" as const, publishedAt: null } : {}),
      },
    });

    // ชั้นเรียนเปลี่ยน → อัปเดตนักเรียนทั้งรอบให้ตรงกัน
    if (classLevelChanged) {
      await tx.student.updateMany({
        where: { examSessionId: input.examSessionId },
        data: { classLevel: nextClassLevel },
      });
    }

    if (rankingRuleChanged) {
      await tx.resultSnapshot.deleteMany({ where: { examSessionId: input.examSessionId } });
    }

    return exam;
  });

  peerSnapshotMemoryCache.delete(input.examSessionId);
  if (rankingRuleChanged) {
    clearActivePublishedExamCache();
  } else {
    await rebuildPublicResultCache(input.examSessionId);
  }
  return { exam: updated, rankingRuleChanged };
}

export async function saveExamRooms(
  examSessionId: string,
  rooms: Array<{ room: string; quota: number }>,
) {
  const prisma = getPrisma();
  const normalizedRooms = rooms.map((room) => ({
    room: room.room.trim(),
    quota: Number(room.quota || 0),
  }));
  const uniqueRooms = new Set(normalizedRooms.map((room) => room.room).filter(Boolean));
  if (uniqueRooms.size !== rooms.length) {
    throw new Error("ชื่อห้องซ้ำหรือว่าง");
  }

  const [existingRooms, studentRooms] = await Promise.all([
    prisma.roomQuota.findMany({
      where: { examSessionId },
      select: { room: true, quota: true },
      orderBy: { room: "asc" },
    }),
    prisma.student.findMany({
      where: { examSessionId },
      distinct: ["room"],
      select: { room: true },
    }),
  ]);
  // กันลบ/เปลี่ยนชื่อห้องที่ยังมีนักเรียนอยู่
  const missingStudentRoom = studentRooms.find((entry) => !uniqueRooms.has(entry.room));
  if (missingStudentRoom) {
    throw new Error(`ห้อง ${missingStudentRoom.room} มีนักเรียนอยู่ จึงลบหรือเปลี่ยนชื่อห้องนี้ไม่ได้`);
  }

  // โควตา/ชุดห้องเปลี่ยน = กติกาจัดอันดับเปลี่ยน → ล้างผลเก่า + กลับเป็นฉบับร่าง
  const currentSignature = existingRooms.map((room) => `${room.room}:${room.quota}`).sort().join("|");
  const nextSignature = normalizedRooms.map((room) => `${room.room}:${room.quota}`).sort().join("|");
  const rankingRuleChanged = currentSignature !== nextSignature;

  await prisma.$transaction([
    prisma.roomQuota.deleteMany({ where: { examSessionId } }),
    prisma.roomQuota.createMany({
      data: normalizedRooms.map((room) => ({
        examSessionId,
        room: room.room,
        quota: room.quota,
      })),
    }),
    ...(rankingRuleChanged
      ? [
          prisma.resultSnapshot.deleteMany({ where: { examSessionId } }),
          prisma.examSession.update({
            where: { id: examSessionId },
            data: { status: "DRAFT" as const, publishedAt: null },
          }),
        ]
      : []),
  ]);

  if (rankingRuleChanged) {
    peerSnapshotMemoryCache.delete(examSessionId);
    clearActivePublishedExamCache();
  }
  return { rankingRuleChanged };
}

export async function saveExamSubjects(
  examSessionId: string,
  subjects: Array<{ name: string; maxScore: number; sortOrder: number; tieBreakOrder?: number | null }>,
) {
  const prisma = getPrisma();
  const studentCount = await prisma.student.count({ where: { examSessionId } });
  if (studentCount > 0) {
    throw new Error("มีรายชื่อนักเรียนแล้ว กรุณาลบ/สร้างรอบสอบใหม่ก่อนแก้รายวิชา");
  }

  const uniqueNames = new Set(subjects.map((subject) => subject.name.trim()).filter(Boolean));
  if (uniqueNames.size !== subjects.length) {
    throw new Error("ชื่อวิชาซ้ำหรือว่าง");
  }

  return prisma.$transaction([
    prisma.subject.deleteMany({ where: { examSessionId } }),
    prisma.subject.createMany({
      data: subjects.map((subject, index) => ({
        examSessionId,
        name: subject.name.trim(),
        maxScore: Number(subject.maxScore),
        sortOrder: Number.isFinite(subject.sortOrder) ? subject.sortOrder : index,
        isTieBreak: subject.tieBreakOrder != null,
        tieBreakOrder: subject.tieBreakOrder ?? null,
      })),
    }),
  ]);
}

export async function updateSubjectMaxScore(input: {
  examSessionId: string;
  subjectId: string;
  maxScore: number;
  mode: SubjectMaxScoreAdjustmentMode;
}) {
  const result = await updateSubjectMaxScores({
    examSessionId: input.examSessionId,
    mode: input.mode,
    subjects: [{ subjectId: input.subjectId, maxScore: input.maxScore }],
  });
  return {
    changed: result.changed,
    subjectName: result.subjects[0]?.subjectName ?? "",
    adjustedScores: result.adjustedScores,
    invalidatedResults: result.invalidatedResults,
  };
}

export async function updateSubjectMaxScores(input: {
  examSessionId: string;
  mode: SubjectMaxScoreAdjustmentMode;
  subjects: Array<{ subjectId: string; maxScore: number }>;
}) {
  const prisma = getPrisma();
  if (input.subjects.length === 0) {
    throw new Error("ไม่มีวิชาที่ต้องแก้คะแนนเต็ม");
  }
  const normalizedSubjects = input.subjects.map((subject) => ({
    subjectId: subject.subjectId,
    maxScore: Number(subject.maxScore),
  }));
  if (normalizedSubjects.some((subject) => !subject.subjectId || !Number.isFinite(subject.maxScore) || subject.maxScore <= 0)) {
    throw new Error("คะแนนเต็มต้องมากกว่า 0");
  }

  const result = await prisma.$transaction(async (tx) => {
    let changed = false;
    let adjustedScores = 0;
    const subjects: Array<{ subjectName: string; oldMaxScore: number | null; newMaxScore: number }> = [];

    for (const update of normalizedSubjects) {
      const subject = await tx.subject.findFirst({
        where: { id: update.subjectId, examSessionId: input.examSessionId },
        select: { id: true, name: true, maxScore: true },
      });
      if (!subject) throw new Error("ไม่พบวิชาที่ต้องการแก้ไข");

      const currentMaxScore = Number(subject.maxScore ?? 0);
      if (currentMaxScore === update.maxScore) {
        subjects.push({ subjectName: subject.name, oldMaxScore: subject.maxScore, newMaxScore: update.maxScore });
        continue;
      }

      if (input.mode === "KEEP_SCORES") {
        const highest = await tx.score.findFirst({
          where: { subjectId: subject.id },
          orderBy: { value: "desc" },
          select: {
            value: true,
            student: { select: { examNo: true, name: true } },
          },
        });
        if (highest && highest.value > update.maxScore) {
          throw new Error(
            `บันทึกไม่ได้ เพราะวิชา ${subject.name} มีนักเรียนได้ ${highest.value} คะแนน (${highest.student.examNo} ${highest.student.name}) แต่คะแนนเต็มใหม่คือ ${update.maxScore}`,
          );
        }
      } else {
        if (!Number.isFinite(currentMaxScore) || currentMaxScore <= 0) {
          throw new Error(`ปรับคะแนนวิชา ${subject.name} ตามสัดส่วนไม่ได้ เพราะคะแนนเต็มเดิมไม่ถูกต้อง`);
        }
        const ratio = update.maxScore / currentMaxScore;
        const updatedCount = await tx.$executeRaw`
          UPDATE "Score"
          SET "value" = ROUND(("value" * ${ratio})::numeric, 2)::double precision
          WHERE "subjectId" = ${subject.id}
        `;
        adjustedScores += Number(updatedCount);
      }

      await tx.subject.update({
        where: { id: subject.id },
        data: { maxScore: update.maxScore },
      });
      changed = true;
      subjects.push({ subjectName: subject.name, oldMaxScore: subject.maxScore, newMaxScore: update.maxScore });
    }

    const deleted = changed
      ? await tx.resultSnapshot.deleteMany({ where: { examSessionId: input.examSessionId } })
      : { count: 0 };
    if (changed) {
      await tx.examSession.update({
        where: { id: input.examSessionId },
        data: { status: "DRAFT", publishedAt: null },
      });
    }

    return {
      changed,
      subjects,
      adjustedScores,
      invalidatedResults: deleted.count,
    };
  }, { maxWait: 10_000, timeout: 20_000 });

  if (result.changed) {
    peerSnapshotMemoryCache.delete(input.examSessionId);
    clearActivePublishedExamCache();
  }

  return result;
}

export async function importExam(input: {
  examName: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  wholeLevelQuota?: number | null;
  roomQuotas?: Record<string, number>;
  tieBreakSubjects: string[];
  rows: ImportedStudentRow[];
  filename: string;
}) {
  const prisma = getPrisma();
  const subjectNames = Object.keys(input.rows[0]?.scores ?? {});

  return prisma.$transaction(async (tx) => {
    const exam = await tx.examSession.create({
      data: {
        name: input.examName,
        classLevel: input.classLevel,
        selectionMode: input.selectionMode,
        wholeLevelQuota: input.selectionMode === "WHOLE_LEVEL" ? input.wholeLevelQuota : null,
      },
    });

    const subjects = await Promise.all(
      subjectNames.map((name, index) =>
        tx.subject.create({
          data: {
            examSessionId: exam.id,
            name,
            sortOrder: index,
            isTieBreak: input.tieBreakSubjects.includes(name),
            tieBreakOrder: input.tieBreakSubjects.includes(name)
              ? input.tieBreakSubjects.indexOf(name) + 1
              : null,
          },
        }),
      ),
    );

    const subjectsByName = new Map(subjects.map((subject) => [subject.name, subject]));

    for (const row of input.rows) {
      const student = await tx.student.create({
        data: {
          examSessionId: exam.id,
          examNo: row.examNo,
          name: row.studentName,
          classLevel: row.classLevel,
          room: row.room,
          verifierHash: verifierHash(row.verifier),
        },
      });

      await tx.score.createMany({
        data: Object.entries(row.scores).map(([subjectName, value]) => ({
          studentId: student.id,
          subjectId: subjectsByName.get(subjectName)!.id,
          value,
        })),
      });
    }

    if (input.selectionMode === "PER_ROOM") {
      await tx.roomQuota.createMany({
        data: Object.entries(input.roomQuotas ?? {}).map(([room, quota]) => ({
          examSessionId: exam.id,
          room,
          quota: Number(quota),
        })),
      });
    }

    await tx.importBatch.create({
      data: {
        examSessionId: exam.id,
        filename: input.filename,
        status: "COMMITTED",
        rawPreview: input.rows.slice(0, 10),
      },
    });

    return exam;
  });
}

export function normalizeRoomImportRows(input: {
  rawRows: Record<string, unknown>[];
  subjects: Array<{ id: string; name: string; maxScore: number | null }>;
  requireScores?: boolean;
}) {
  // requireScores=true (แบบที่ 1): ทุกวิชาต้องมีคอลัมน์+คะแนน
  // requireScores=false (แบบที่ 2: นำเข้ารายชื่อก่อน): ไม่มีคอลัมน์คะแนน/ปล่อยว่างได้ → กรอกทีหลัง
  const requireScores = input.requireScores ?? true;
  const errors: string[] = [];
  const subjectsByName = new Map(input.subjects.map((subject) => [subject.name, subject]));
  const seenExamNos = new Set<string>();

  if (input.subjects.length === 0) {
    errors.push("ต้องสร้างวิชาก่อนนำเข้ารายชื่อ");
  }

  const rows = input.rawRows.map((row, index) => {
    const examNo = String(row.student_id ?? row.exam_no ?? row["รหัสนักเรียน"] ?? row["เลขประจำตัว"] ?? row["เลขที่สอบ"] ?? row["รหัสสอบ"] ?? "").trim();
    const studentName = String(row.student_name ?? row["ชื่อนักเรียน"] ?? row["ชื่อ-สกุล"] ?? row["ชื่อ"] ?? row.name ?? "").trim();
    const scores: Record<string, number> = {};

    if (!examNo) errors.push(`แถว ${index + 2}: ไม่พบรหัสนักเรียน`);
    if (!studentName) errors.push(`แถว ${index + 2}: ไม่พบชื่อนักเรียน`);
    if (examNo && seenExamNos.has(examNo)) errors.push(`แถว ${index + 2}: รหัสนักเรียนซ้ำ (${examNo})`);
    seenExamNos.add(examNo);

    for (const subject of subjectsByName.values()) {
      const raw = row[subject.name];
      const blank = !(subject.name in row) || raw == null || String(raw).trim() === "";
      if (blank) {
        // โหมดบังคับคะแนน → error · โหมด roster → ข้าม (ยังไม่กรอก)
        if (requireScores) {
          errors.push(`แถว ${index + 2}: ${subject.name in row ? "ยังไม่มีคะแนนวิชา" : "ไม่พบคอลัมน์วิชา"} ${subject.name}`);
        }
        continue;
      }

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors.push(`แถว ${index + 2}: คะแนนวิชา ${subject.name} ไม่ใช่ตัวเลข`);
        if (requireScores) scores[subject.id] = 0;
      } else if (value < 0) {
        errors.push(`แถว ${index + 2}: คะแนนวิชา ${subject.name} ต้องไม่ติดลบ`);
        scores[subject.id] = value;
      } else if (subject.maxScore != null && value > subject.maxScore) {
        errors.push(`แถว ${index + 2}: คะแนนวิชา ${subject.name} เกินคะแนนเต็ม ${subject.maxScore}`);
        scores[subject.id] = value;
      } else {
        scores[subject.id] = value;
      }
    }

    return { examNo, studentName, scores };
  });

  return { rows, errors: [...new Set(errors)] };
}

export async function importRoomStudents(input: {
  examSessionId: string;
  room: string;
  rawRows: Record<string, unknown>[];
  requireScores?: boolean;
}) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: input.examSessionId },
    include: { subjects: { orderBy: { sortOrder: "asc" } } },
  });
  if (!exam) throw new Error("ไม่พบรอบสอบ");

  const normalized = normalizeRoomImportRows({
    rawRows: input.rawRows,
    requireScores: input.requireScores,
    subjects: exam.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      maxScore: subject.maxScore,
    })),
  });
  if (normalized.errors.length > 0) {
    return { ok: false as const, errors: normalized.errors };
  }
  if (normalized.rows.length === 0) {
    return { ok: false as const, errors: ["ไม่พบข้อมูลนักเรียน"] };
  }

  const examNos = normalized.rows.map((row) => row.examNo);
  const duplicateOutsideRoom = await prisma.student.findFirst({
    where: {
      examSessionId: input.examSessionId,
      examNo: { in: examNos },
      NOT: { room: input.room },
    },
  });
  if (duplicateOutsideRoom) {
    return { ok: false as const, errors: [`รหัสนักเรียน ${duplicateOutsideRoom.examNo} มีอยู่ในห้องอื่นแล้ว`] };
  }

  await prisma.$transaction(async (tx) => {
    await tx.student.deleteMany({
      where: { examSessionId: input.examSessionId, room: input.room },
    });

    await tx.student.createMany({
      data: normalized.rows.map((row) => ({
        examSessionId: input.examSessionId,
        examNo: row.examNo,
        name: row.studentName,
        classLevel: exam.classLevel,
        room: input.room,
        verifierHash: verifierHash(row.examNo),
      })),
    });

    const students = await tx.student.findMany({
      where: {
        examSessionId: input.examSessionId,
        room: input.room,
        examNo: { in: examNos },
      },
      select: { id: true, examNo: true },
    });
    const studentIdByExamNo = new Map(students.map((student) => [student.examNo, student.id]));

    const scoreRows = normalized.rows.flatMap((row) => {
      const studentId = studentIdByExamNo.get(row.examNo);
      if (!studentId) return [];
      return Object.entries(row.scores).map(([subjectId, value]) => ({
        studentId,
        subjectId,
        value,
      }));
    });

    if (scoreRows.length > 0) {
      await tx.score.createMany({ data: scoreRows });
    }

    await tx.importBatch.create({
      data: {
        examSessionId: input.examSessionId,
        filename: `room-${input.room}`,
        status: "ROOM_COMMITTED",
        rawPreview: input.rawRows.slice(0, 10) as never,
      },
    });
  }, { timeout: 20_000 });

  return { ok: true as const, imported: normalized.rows.length };
}

// ===== กรอก/แก้คะแนนรายคนภายหลัง (สำหรับนำเข้าแบบที่ 2) =====
// โหลดตารางกรอกคะแนน: วิชา + นักเรียน(พร้อมคะแนนที่กรอกไว้แล้ว)
export async function getExamScoreSheet(examSessionId: string) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    include: {
      subjects: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, maxScore: true } },
      students: {
        orderBy: [{ room: "asc" }, { examNo: "asc" }],
        select: { id: true, examNo: true, name: true, room: true, absent: true, scores: { select: { subjectId: true, value: true } } },
      },
    },
  });
  if (!exam) return null;
  return {
    examSessionId,
    status: exam.status,
    subjects: exam.subjects,
    students: exam.students.map((student) => ({
      id: student.id,
      examNo: student.examNo,
      name: student.name,
      room: student.room,
      absent: student.absent,
      scores: Object.fromEntries(student.scores.map((score) => [score.subjectId, score.value])) as Record<string, number>,
    })),
  };
}

// บันทึกคะแนนที่กรอก/แก้: ค่า null หรือ "" = ลบคะแนนวิชานั้นของคนนั้น (ยังไม่กรอก)
export async function saveExamScores(input: {
  examSessionId: string;
  updates: Array<{ studentId: string; scores: Record<string, number | null>; absent?: boolean }>;
}) {
  const prisma = getPrisma();
  const subjects = await prisma.subject.findMany({ where: { examSessionId: input.examSessionId }, select: { id: true, name: true, maxScore: true } });
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const studentIds = input.updates.map((update) => update.studentId);
  const validStudents = await prisma.student.findMany({ where: { id: { in: studentIds }, examSessionId: input.examSessionId }, select: { id: true } });
  const validStudentIds = new Set(validStudents.map((student) => student.id));

  const errors: string[] = [];
  const ops: Array<
    | ReturnType<typeof prisma.score.upsert>
    | ReturnType<typeof prisma.score.deleteMany>
    | ReturnType<typeof prisma.student.update>
  > = [];

  for (const update of input.updates) {
    if (!validStudentIds.has(update.studentId)) continue;
    // ติ๊ก/ยกเลิก "ไม่ได้เข้าสอบ"
    if (typeof update.absent === "boolean") {
      ops.push(prisma.student.update({ where: { id: update.studentId }, data: { absent: update.absent } }));
    }
    for (const [subjectId, rawValue] of Object.entries(update.scores)) {
      const subject = subjectById.get(subjectId);
      if (!subject) continue;
      if (rawValue == null || Number.isNaN(rawValue)) {
        ops.push(prisma.score.deleteMany({ where: { studentId: update.studentId, subjectId } }));
        continue;
      }
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`คะแนนวิชา ${subject.name} ไม่ถูกต้อง`);
        continue;
      }
      if (subject.maxScore != null && value > subject.maxScore) {
        errors.push(`คะแนนวิชา ${subject.name} เกินคะแนนเต็ม ${subject.maxScore}`);
        continue;
      }
      ops.push(
        prisma.score.upsert({
          where: { studentId_subjectId: { studentId: update.studentId, subjectId } },
          create: { studentId: update.studentId, subjectId, value },
          update: { value },
        }),
      );
    }
  }

  if (errors.length > 0) return { ok: false as const, errors: [...new Set(errors)] };
  if (ops.length > 0) {
    await prisma.$transaction(ops);
    // คะแนนเปลี่ยน → ผลที่เคยคำนวณ/แคชไว้ถือว่า stale ล้าง peer cache กันค่าค้าง
    // (ครูต้องกด "คำนวณ" หรือ "ประกาศผล" ใหม่เพื่อให้ snapshot/หน้าเว็บอัปเดต — publish คำนวณใหม่ให้เสมอแล้ว)
    peerSnapshotMemoryCache.delete(input.examSessionId);
  }
  return { ok: true as const, saved: ops.length };
}

export async function getExamResultSnapshots(examSessionId: string) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    select: { selectionMode: true },
  });
  if (!exam) throw new Error("ไม่พบรอบสอบ");

  const snapshots = await prisma.resultSnapshot.findMany({
    where: { examSessionId },
    include: { student: true },
    orderBy: [
      { student: { room: "asc" } },
      { rank: "asc" },
      { student: { examNo: "asc" } },
    ],
  });

  return snapshots.map((snapshot) => ({
    studentId: snapshot.studentId,
    examNo: snapshot.student.examNo,
    name: snapshot.student.name,
    rank: snapshot.rank,
    rankScope: exam.selectionMode === "WHOLE_LEVEL" ? "WHOLE_LEVEL" : "ROOM",
    selectionMode: exam.selectionMode,
    totalScore: snapshot.totalScore,
    status: snapshot.status,
    reason: snapshot.reason,
    tieBreakReason: null,
    room: snapshot.student.room,
    scoreBreakdown: snapshot.scoreBreakdown as Record<string, number>,
    tieBreakValues: snapshot.tieBreakValues as Record<string, number>,
  }));
}

export async function calculateExamResults(examSessionId: string) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    include: {
      subjects: { orderBy: { sortOrder: "asc" } },
      students: { include: { scores: true } },
      roomQuotas: true,
    },
  });

  if (!exam) throw new Error("ไม่พบรอบสอบ");

  const subjects: SubjectInput[] = exam.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    sortOrder: subject.sortOrder,
    maxScore: subject.maxScore,
    tieBreakOrder: subject.tieBreakOrder,
  }));

  // คนขาดสอบ (absent) ไม่นับในการจัดอันดับ/โควตา/ค่าเฉลี่ย → แยกออกก่อน
  const presentStudents = exam.students.filter((student) => !student.absent);
  const absentStudents = exam.students.filter((student) => student.absent);

  const candidates: CandidateInput[] = presentStudents.map((student) => ({
    studentId: student.id,
    examNo: student.examNo,
    name: student.name,
    classLevel: student.classLevel,
    room: student.room,
    scores: Object.fromEntries(student.scores.map((score) => [score.subjectId, score.value])),
  }));

  const rule: RankingRule = {
    selectionMode: exam.selectionMode,
    wholeLevelQuota: exam.wholeLevelQuota,
    roomQuotas: Object.fromEntries(exam.roomQuotas.map((quota) => [quota.room, quota.quota])),
    tieBreakSubjectIds: exam.subjects
      .filter((subject) => subject.isTieBreak)
      .sort((a, b) => Number(a.tieBreakOrder) - Number(b.tieBreakOrder))
      .map((subject) => subject.id),
  };

  const calculated = calculateResults(candidates, subjects, rule);

  // snapshot ของคนขาดสอบ: สถานะ ABSENT ไม่มีอันดับ/คะแนน (rank 0) เพื่อให้เช็คแล้วเห็น "ไม่ได้เข้าสอบ"
  const absentSnapshots = absentStudents.map((student) => ({
    examSessionId,
    studentId: student.id,
    rank: 0,
    totalScore: 0,
    status: "ABSENT" as const,
    reason: "ไม่ได้เข้าสอบ",
    scoreBreakdown: {} as Prisma.InputJsonValue,
    tieBreakValues: {} as Prisma.InputJsonValue,
  }));

  await prisma.$transaction([
    prisma.resultSnapshot.deleteMany({ where: { examSessionId } }),
    prisma.resultSnapshot.createMany({
      data: [
        ...calculated.map((result) => ({
          examSessionId,
          studentId: result.studentId,
          rank: result.rank,
          totalScore: result.totalScore,
          status: result.status,
          reason: result.reason,
          scoreBreakdown: result.scoreBreakdown,
          tieBreakValues: result.tieBreakValues,
        })),
        ...absentSnapshots,
      ],
    }),
  ]);
  peerSnapshotMemoryCache.delete(examSessionId);
  await rebuildPublicResultCache(examSessionId);

  return calculated;
}

export async function publishExam(
  examSessionId: string,
  announcement?: { passTitle?: string | null; passInstructions?: string | null; scoreDisplayMode?: string },
) {
  const prisma = getPrisma();
  // คำนวณใหม่ทุกครั้งก่อนประกาศ → ผลที่ประกาศสะท้อนคะแนนล่าสุดเสมอ
  // (เดิมคำนวณเฉพาะตอนยังไม่มี snapshot → ถ้าแก้คะแนนหลังเคยคำนวณ จะประกาศอันดับเก่า)
  await calculateExamResults(examSessionId);

  const publishedAt = new Date();
  await prisma.$transaction([
    prisma.examSession.update({
      where: { id: examSessionId },
      data: {
        status: "PUBLISHED",
        publishedAt,
        ...(announcement
          ? {
              passTitle: announcement.passTitle?.trim() || null,
              passInstructions: announcement.passInstructions?.trim() || null,
              ...(announcement.scoreDisplayMode
                ? { scoreDisplayMode: announcement.scoreDisplayMode === "PERCENT" ? "PERCENT" : "RAW" }
                : {}),
            }
          : {}),
      },
    }),
    prisma.resultSnapshot.updateMany({
      where: { examSessionId },
      data: { publishedAt },
    }),
  ]);
  peerSnapshotMemoryCache.delete(examSessionId);
  clearActivePublishedExamCache();
  const rebuilt = await rebuildPublicResultCache(examSessionId);
  const cacheHealth = await getPublicResultCacheHealth(examSessionId);

  return { publishedAt, ...rebuilt, cacheHealth };
}

export async function deleteExamPublishedResults(examSessionId: string) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    select: { id: true },
  });
  if (!exam) throw new Error("ไม่พบรอบสอบ");

  const [deleted] = await prisma.$transaction([
    prisma.resultSnapshot.deleteMany({ where: { examSessionId } }),
    prisma.examSession.update({
      where: { id: examSessionId },
      data: {
        status: "DRAFT",
        publishedAt: null,
      },
    }),
  ]);
  peerSnapshotMemoryCache.delete(examSessionId);
  clearActivePublishedExamCache();
  return { deleted: deleted.count };
}

// ลบรอบสอบทั้งรอบ (cascade: วิชา/ห้อง/นักเรียน/คะแนน/ผล/การผูก LINE หายตามทั้งหมด)
export async function deleteExamSession(examSessionId: string) {
  const prisma = getPrisma();
  const settings = await prisma.schoolSettings.findUnique({ where: { id: "main" }, select: { activeExamSessionId: true } });
  await prisma.$transaction(async (tx) => {
    // ถ้าเป็นรอบสอบที่ตั้งเป็น active อยู่ → ปลดออกก่อน กัน activeExamSessionId ค้างชี้รอบที่ลบ
    if (settings?.activeExamSessionId === examSessionId) {
      await tx.schoolSettings.update({ where: { id: "main" }, data: { activeExamSessionId: null } });
    }
    await tx.examSession.delete({ where: { id: examSessionId } });
  });
  peerSnapshotMemoryCache.delete(examSessionId);
  clearActivePublishedExamCache();
  clearSchoolSettingsCache();
  return { ok: true as const };
}

// ลบนักเรียนรายคน (cascade: คะแนน/ผล/การผูก LINE ของคนนั้นหายตาม)
// อันดับคนอื่นจะ stale จนกว่าจะกด "คำนวณ"/"ประกาศผล" ใหม่ (publish คำนวณใหม่ให้เสมอ)
export async function deleteStudent(studentId: string) {
  const prisma = getPrisma();
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { examSessionId: true } });
  if (!student) return { ok: false as const, error: "ไม่พบนักเรียน" };
  await prisma.student.delete({ where: { id: studentId } });
  peerSnapshotMemoryCache.delete(student.examSessionId);
  return { ok: true as const, examSessionId: student.examSessionId };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function publicLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:image/") && logoUrl.length > 20_000) return "/api/settings/logo";
  return logoUrl;
}

function publicExamLogoUrl(examId: string, logoUrl?: string | null, showEventLogo?: boolean | null) {
  if (!showEventLogo || !logoUrl) return null;
  if (logoUrl.startsWith("data:image/") && logoUrl.length > 20_000) return `/api/exams/${examId}/event-logo`;
  return logoUrl;
}

function publicSchoolFromSettings(settings: Awaited<ReturnType<typeof getSchoolSettings>>) {
  return {
    schoolName: settings.schoolName,
    examTitle: settings.examTitle,
    logoUrl: publicLogoUrl(settings.logoUrl),
    schoolContact: settings.schoolContact,
  };
}

function normalizeCachedPublicResult(
  settings: Awaited<ReturnType<typeof getSchoolSettings>>,
  value: unknown,
): PublicStudentResult | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<PublicStudentResult>;
  if (!payload.exam || !payload.student || !payload.result || !payload.statistics) return null;
  return {
    ...(payload as PublicStudentResult),
    school: publicSchoolFromSettings(settings),
  };
}

function competitionRank(values: Array<{ studentId: string; value: number; examNo: string }>, studentId: string) {
  const sorted = [...values].sort((a, b) => {
    const diff = b.value - a.value;
    if (diff !== 0) return diff;
    return a.examNo.localeCompare(b.examNo, "th");
  });
  let currentRank = 1;
  let previousValue: number | null = null;

  for (const [index, entry] of sorted.entries()) {
    if (previousValue != null && entry.value !== previousValue) {
      currentRank = index + 1;
    }
    if (entry.studentId === studentId) return currentRank;
    previousValue = entry.value;
  }

  return sorted.length;
}

function buildRankMap(entries: Array<{ studentId: string; examNo: string; value: number }>) {
  const sorted = [...entries].sort((a, b) => {
    const diff = b.value - a.value;
    if (diff !== 0) return diff;
    return a.examNo.localeCompare(b.examNo, "th");
  });
  const ranks = new Map<string, number>();
  let currentRank = 1;
  let previousValue: number | null = null;

  for (const [index, entry] of sorted.entries()) {
    if (previousValue != null && entry.value !== previousValue) {
      currentRank = index + 1;
    }
    ranks.set(entry.studentId, currentRank);
    previousValue = entry.value;
  }

  return ranks;
}

function buildGroupStats(snapshots: PublicResultSnapshotInput[], subjects: PublicResultExamInput["subjects"]) {
  const count = snapshots.length;
  const totalAverage = average(snapshots.map((snapshot) => snapshot.totalScore));
  const totalRanks = buildRankMap(
    snapshots.map((snapshot) => ({
      studentId: snapshot.studentId,
      examNo: snapshot.student.examNo,
      value: snapshot.totalScore,
    })),
  );
  const subjectStats = new Map<string, { average: number; ranks: Map<string, number> }>();

  for (const subject of subjects) {
    const values = snapshots.map((snapshot) => ({
      studentId: snapshot.studentId,
      examNo: snapshot.student.examNo,
      value: Number((snapshot.scoreBreakdown as Record<string, number>)[subject.id] ?? 0),
    }));
    subjectStats.set(subject.id, {
      average: average(values.map((entry) => entry.value)),
      ranks: buildRankMap(values),
    });
  }

  return { count, totalAverage, totalRanks, subjectStats };
}

function buildPublicResultPayloads(
  settings: Awaited<ReturnType<typeof getSchoolSettings>>,
  exam: PublicResultExamInput,
  snapshots: PublicResultSnapshotInput[],
) {
  const subjectNameById = new Map(exam.subjects.map((subject) => [subject.id, subject.name]));
  // สถิติ (ค่าเฉลี่ย/อันดับ/จำนวน) คิดจากคนที่เข้าสอบเท่านั้น — คนขาดสอบไม่นับ
  const rankedSnapshots = snapshots.filter((snapshot) => snapshot.status !== "ABSENT");
  const levelStats = buildGroupStats(rankedSnapshots, exam.subjects);
  const snapshotsByRoom = new Map<string, PublicResultSnapshotInput[]>();
  for (const snapshot of rankedSnapshots) {
    snapshotsByRoom.set(snapshot.student.room, [...(snapshotsByRoom.get(snapshot.student.room) ?? []), snapshot]);
  }
  const roomStats = new Map(
    Array.from(snapshotsByRoom.entries()).map(([room, roomSnapshots]) => [
      room,
      buildGroupStats(roomSnapshots, exam.subjects),
    ]),
  );

  return new Map(
    snapshots.map((snapshot) => {
      // คนขาดสอบ: payload ขั้นต่ำ (สถานะ ABSENT, ไม่มีคะแนน/อันดับ/สถิติ) → หน้าเว็บ/LINE โชว์แค่ "ไม่ได้เข้าสอบ"
      if (snapshot.status === "ABSENT") {
        const absentPayload: PublicStudentResult = {
          school: publicSchoolFromSettings(settings),
          exam: {
            id: exam.id,
            name: exam.name,
            classLevel: exam.classLevel,
            selectionMode: exam.selectionMode,
            publishedAt: exam.publishedAt ? exam.publishedAt.toISOString() : null,
            passTitle: exam.passTitle,
            passInstructions: exam.passInstructions,
            eventLogoUrl: publicExamLogoUrl(exam.id, exam.eventLogoUrl, exam.showEventLogo),
            showEventLogo: exam.showEventLogo,
            scoreDisplayMode: exam.scoreDisplayMode === "PERCENT" ? "PERCENT" : "RAW",
          },
          student: {
            examNo: snapshot.student.examNo,
            name: snapshot.student.name,
            classLevel: snapshot.student.classLevel,
            room: snapshot.student.room,
          },
          result: { rank: 0, totalScore: 0, status: "ABSENT", reason: "ไม่ได้เข้าสอบ", scoreBreakdown: {} },
          statistics: { total: { score: 0, maxScore: 0, roomAverage: 0, levelAverage: 0, roomRank: 0, levelRank: 0, roomCount: 0, levelCount: 0 }, subjects: [] },
        };
        return [snapshot.studentId, absentPayload];
      }
      const room = roomStats.get(snapshot.student.room) ?? levelStats;
      const rawBreakdown = snapshot.scoreBreakdown as Record<string, number>;
      const payload: PublicStudentResult = {
        school: publicSchoolFromSettings(settings),
        exam: {
          id: exam.id,
          name: exam.name,
          classLevel: exam.classLevel,
          selectionMode: exam.selectionMode,
          publishedAt: exam.publishedAt ? exam.publishedAt.toISOString() : null,
          passTitle: exam.passTitle,
          passInstructions: exam.passInstructions,
          eventLogoUrl: publicExamLogoUrl(exam.id, exam.eventLogoUrl, exam.showEventLogo),
          showEventLogo: exam.showEventLogo,
          scoreDisplayMode: exam.scoreDisplayMode === "PERCENT" ? "PERCENT" : "RAW",
        },
        student: {
          examNo: snapshot.student.examNo,
          name: snapshot.student.name,
          classLevel: snapshot.student.classLevel,
          room: snapshot.student.room,
        },
        result: {
          rank: snapshot.rank,
          totalScore: snapshot.totalScore,
          status: snapshot.status,
          reason: snapshot.reason,
          scoreBreakdown: Object.fromEntries(
            Object.entries(rawBreakdown).map(([subjectId, value]) => [
              subjectNameById.get(subjectId) ?? subjectId,
              value,
            ]),
          ),
        },
        statistics: {
          total: {
            score: snapshot.totalScore,
            maxScore: exam.subjects.reduce((sum, subject) => sum + Number(subject.maxScore ?? 0), 0),
            roomAverage: room.totalAverage,
            levelAverage: levelStats.totalAverage,
            roomRank: room.totalRanks.get(snapshot.studentId) ?? room.count,
            levelRank: levelStats.totalRanks.get(snapshot.studentId) ?? levelStats.count,
            roomCount: room.count,
            levelCount: levelStats.count,
          },
          subjects: exam.subjects.map((subject) => {
            const roomSubject = room.subjectStats.get(subject.id);
            const levelSubject = levelStats.subjectStats.get(subject.id);
            return {
              id: subject.id,
              name: subject.name,
              score: Number(rawBreakdown[subject.id] ?? 0),
              maxScore: Number(subject.maxScore ?? 0),
              roomAverage: roomSubject?.average ?? 0,
              levelAverage: levelSubject?.average ?? 0,
              roomRank: roomSubject?.ranks.get(snapshot.studentId) ?? room.count,
              levelRank: levelSubject?.ranks.get(snapshot.studentId) ?? levelStats.count,
              roomCount: room.count,
              levelCount: levelStats.count,
            };
          }),
        },
      };
      return [snapshot.studentId, payload];
    }),
  );
}

function numericBreakdown(snapshot: Pick<PeerResultSnapshot, "scoreBreakdown">) {
  return snapshot.scoreBreakdown as Record<string, number>;
}

function buildResultStatistics(
  student: ResultStudent,
  result: ResultStudent["resultSnapshots"][number],
  peerSnapshots: PeerResultSnapshot[],
) {
  const subjects = student.examSession.subjects;
  const roomSnapshots = peerSnapshots.filter((snapshot) => snapshot.student.room === student.room);
  const asRankInput = (snapshots: PeerResultSnapshot[], subjectId?: string) =>
    snapshots.map((snapshot) => ({
      studentId: snapshot.studentId,
      examNo: snapshot.student.examNo,
      value: subjectId ? Number(numericBreakdown(snapshot)[subjectId] ?? 0) : snapshot.totalScore,
    }));

  return {
    total: {
      score: result.totalScore,
      roomAverage: average(roomSnapshots.map((snapshot) => snapshot.totalScore)),
      levelAverage: average(peerSnapshots.map((snapshot) => snapshot.totalScore)),
      roomRank: competitionRank(asRankInput(roomSnapshots), student.id),
      levelRank: competitionRank(asRankInput(peerSnapshots), student.id),
      roomCount: roomSnapshots.length,
      levelCount: peerSnapshots.length,
    },
    subjects: subjects.map((subject) => {
      const score = Number((result.scoreBreakdown as Record<string, number>)[subject.id] ?? 0);
      return {
        id: subject.id,
        name: subject.name,
        score,
        roomAverage: average(roomSnapshots.map((snapshot) => Number(numericBreakdown(snapshot)[subject.id] ?? 0))),
        levelAverage: average(peerSnapshots.map((snapshot) => Number(numericBreakdown(snapshot)[subject.id] ?? 0))),
        roomRank: competitionRank(asRankInput(roomSnapshots, subject.id), student.id),
        levelRank: competitionRank(asRankInput(peerSnapshots, subject.id), student.id),
        roomCount: roomSnapshots.length,
        levelCount: peerSnapshots.length,
      };
    }),
  };
}

function buildPrivateResult(
  settings: Awaited<ReturnType<typeof getSchoolSettings>>,
  student: ResultStudent,
  peerSnapshots: PeerResultSnapshot[],
) {
  const result = student.resultSnapshots.find(
    (snapshot) => snapshot.examSessionId === student.examSession.id,
  );
  if (!result) return null;

  const subjectNameById = new Map(student.examSession.subjects.map((subject) => [subject.id, subject.name]));
  const rawBreakdown = result.scoreBreakdown as Record<string, number>;

  return {
    school: publicSchoolFromSettings(settings),
    exam: {
      id: student.examSession.id,
      name: student.examSession.name,
      classLevel: student.examSession.classLevel,
      selectionMode: student.examSession.selectionMode,
      publishedAt: student.examSession.publishedAt ? student.examSession.publishedAt.toISOString() : null,
      passTitle: student.examSession.passTitle,
      passInstructions: student.examSession.passInstructions,
      eventLogoUrl: publicExamLogoUrl(student.examSession.id, student.examSession.eventLogoUrl, student.examSession.showEventLogo),
      showEventLogo: student.examSession.showEventLogo,
      scoreDisplayMode: student.examSession.scoreDisplayMode,
    },
    student: {
      examNo: student.examNo,
      name: student.name,
      classLevel: student.classLevel,
      room: student.room,
    },
    result: {
      rank: result.rank,
      totalScore: result.totalScore,
      status: result.status,
      reason: result.reason,
      scoreBreakdown: Object.fromEntries(
        Object.entries(rawBreakdown).map(([subjectId, value]) => [
          subjectNameById.get(subjectId) ?? subjectId,
          value,
        ]),
      ),
    },
    statistics: buildResultStatistics(student, result, peerSnapshots),
  };
}

async function getPublishedPeerSnapshots(examSessionId: string) {
  const cached = peerSnapshotMemoryCache.get(examSessionId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const prisma = getPrisma();
  const data = await prisma.resultSnapshot.findMany({
    where: { examSessionId },
    select: {
      studentId: true,
      totalScore: true,
      scoreBreakdown: true,
      student: {
        select: {
          room: true,
          examNo: true,
        },
      },
    },
  });
  peerSnapshotMemoryCache.set(examSessionId, { expiresAt: Date.now() + peerSnapshotCacheMs, data });
  return data;
}

export async function rebuildPublicResultCache(examSessionId: string) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const exam = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    include: {
      subjects: { orderBy: { sortOrder: "asc" } },
      resultSnapshots: {
        include: {
          student: {
            select: {
              examNo: true,
              name: true,
              classLevel: true,
              room: true,
            },
          },
        },
      },
    },
  });

  if (!exam || exam.resultSnapshots.length === 0) return { updated: 0 };

  const builtAt = new Date();
  const payloads = buildPublicResultPayloads(settings, exam, exam.resultSnapshots);
  const batchSize = 10;
  let updated = 0;

  for (let index = 0; index < exam.resultSnapshots.length; index += batchSize) {
    const batch = exam.resultSnapshots.slice(index, index + batchSize);
    await Promise.all(
      batch.map((snapshot) => {
        const publicResultData = payloads.get(snapshot.studentId);
        if (!publicResultData) return Promise.resolve(null);

        return prisma.resultSnapshot.update({
          where: {
            examSessionId_studentId: {
              examSessionId,
              studentId: snapshot.studentId,
            },
          },
          data: {
            publicResultData: publicResultData as Prisma.InputJsonValue,
            publicResultBuiltAt: builtAt,
          },
        });
      }),
    );
    updated += batch.length;
  }

  return { updated };
}

export async function getPublicResultCacheHealth(examSessionId: string) {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ total: bigint; cached: bigint }>>`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT("publicResultData")::bigint AS cached
    FROM "ResultSnapshot"
    WHERE "examSessionId" = ${examSessionId}
  `;
  const total = Number(rows[0]?.total ?? 0);
  const cached = Number(rows[0]?.cached ?? 0);
  return { total, cached, missing: Math.max(0, total - cached) };
}

async function getActivePublishedExamIdUncached(input?: { examSessionId?: string }) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const activeExamId = settings.activeExamSessionId ?? input?.examSessionId;
  const activeExam = activeExamId
    ? await prisma.examSession.findUnique({
        where: { id: activeExamId },
        select: { id: true, status: true },
      })
    : await prisma.examSession.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { id: true, status: true },
      });

  if (!activeExam || activeExam.status !== "PUBLISHED") return null;
  if (settings.activeExamSessionId && input?.examSessionId && settings.activeExamSessionId !== input.examSessionId) return null;
  return { settings, activeExamId: activeExam.id };
}

async function getActivePublishedExamId(input?: { examSessionId?: string }) {
  const key = input?.examSessionId ?? "__default";
  const cached = activePublishedExamMemoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await getActivePublishedExamIdUncached(input);
  activePublishedExamMemoryCache.set(key, {
    expiresAt: Date.now() + activePublishedExamCacheMs,
    data,
  });
  return data;
}

async function findCachedPublicResultSession(
  settings: Awaited<ReturnType<typeof getSchoolSettings>>,
  input: { examNo: string; studentId?: string; examSessionId: string },
  trace?: ResultLookupTrace | null,
): Promise<PublishedStudentResultSession | null> {
  const prisma = getPrisma();
  const trimmedExamNo = input.examNo.trim();

  const student = input.studentId
    ? await prisma.student.findFirst({
        where: { id: input.studentId, examSessionId: input.examSessionId },
        select: { id: true, examNo: true, examSessionId: true },
      })
    : await prisma.student.findUnique({
        where: {
          examSessionId_examNo: {
            examSessionId: input.examSessionId,
            examNo: trimmedExamNo,
          },
        },
        select: { id: true, examNo: true, examSessionId: true },
      });
  trace?.mark("student_lookup", { found: Boolean(student), byStudentId: Boolean(input.studentId) });

  if (!student) return null;
  if (trimmedExamNo && student.examNo !== trimmedExamNo) return null;

  const snapshot = await prisma.resultSnapshot.findUnique({
    where: {
      examSessionId_studentId: {
        examSessionId: input.examSessionId,
        studentId: student.id,
      },
    },
    select: {
      publicResultData: true,
      student: {
        select: {
          id: true,
          examNo: true,
          examSessionId: true,
          examSession: {
            select: {
              eventLogoUrl: true,
              showEventLogo: true,
              scoreDisplayMode: true,
            },
          },
        },
      },
    },
  });
  trace?.mark("snapshot_lookup", { found: Boolean(snapshot) });

  if (!snapshot) return null;

  const result = normalizeCachedPublicResult(settings, snapshot.publicResultData);
  trace?.mark("public_result_data", { hit: Boolean(result) });
  if (!result || result.exam.id !== snapshot.student.examSessionId || result.student.examNo !== snapshot.student.examNo) {
    return null;
  }
  result.exam.eventLogoUrl = publicExamLogoUrl(
    snapshot.student.examSessionId,
    snapshot.student.examSession.eventLogoUrl,
    snapshot.student.examSession.showEventLogo,
  );
  result.exam.showEventLogo = snapshot.student.examSession.showEventLogo;
  result.exam.scoreDisplayMode = snapshot.student.examSession.scoreDisplayMode === "PERCENT" ? "PERCENT" : "RAW";

  return {
    lookup: {
      examNo: snapshot.student.examNo,
      studentId: snapshot.student.id,
      examSessionId: snapshot.student.examSessionId,
    },
    result,
  };
}

export async function findPublishedStudentResultLookup(input: PublicStudentResultLookup, trace?: ResultLookupTrace | null) {
  const prisma = getPrisma();
  const active = await getActivePublishedExamId({ examSessionId: input.examSessionId });
  if (!active) return null;

  const trimmedExamNo = input.examNo.trim();
  const student = input.studentId
    ? await prisma.student.findFirst({
        where: { id: input.studentId, examSessionId: active.activeExamId },
        select: { id: true, examNo: true, examSessionId: true },
      })
    : await prisma.student.findUnique({
        where: {
          examSessionId_examNo: {
            examSessionId: active.activeExamId,
            examNo: trimmedExamNo,
          },
        },
        select: { id: true, examNo: true, examSessionId: true },
      });
  trace?.mark("lookup_student", { found: Boolean(student), byStudentId: Boolean(input.studentId) });

  if (!student) return null;
  if (trimmedExamNo && student.examNo !== trimmedExamNo) return null;

  const snapshot = await prisma.resultSnapshot.findUnique({
    where: {
      examSessionId_studentId: {
        examSessionId: active.activeExamId,
        studentId: student.id,
      },
    },
    select: { id: true },
  });
  trace?.mark("lookup_snapshot", { found: Boolean(snapshot) });
  if (!snapshot) return null;

  return { examNo: student.examNo, studentId: student.id, examSessionId: student.examSessionId };
}

export async function findPublishedStudentResultSession(input: PublicStudentResultLookup): Promise<PublishedStudentResultLookupResult | null> {
  const trace = startResultLookupTrace("public", input);
  const active = await getActivePublishedExamId({ examSessionId: input.examSessionId });
  trace?.mark("active_exam", { found: Boolean(active) });
  if (!active) {
    trace?.done("no_active_exam");
    return null;
  }

  const cached = await findCachedPublicResultSession(active.settings, {
    examNo: input.examNo,
    studentId: input.studentId,
    examSessionId: active.activeExamId,
  }, trace);
  if (cached) {
    trace?.done("cache_hit", { examSessionId: cached.lookup.examSessionId });
    return cached;
  }

  const lookup = await findPublishedStudentResultLookup(input, trace);
  if (!lookup) {
    trace?.done("not_found");
    return null;
  }
  if (input.studentId && lookup.studentId !== input.studentId) return null;
  if (input.examSessionId && lookup.examSessionId !== input.examSessionId) return null;

  trace?.done("cache_missing", { examSessionId: lookup.examSessionId });
  return { lookup, result: null, cacheMissing: true };
}

export async function checkPrivateResult(input: { examNo: string; studentId?: string; examSessionId?: string }) {
  const trace = startResultLookupTrace("private-fallback", input);
  const prisma = getPrisma();
  const active = await getActivePublishedExamId({ examSessionId: input.examSessionId });
  trace?.mark("active_exam", { found: Boolean(active) });
  if (!active) {
    trace?.done("no_active_exam");
    return null;
  }

  const cached = await findCachedPublicResultSession(active.settings, {
    examNo: input.examNo,
    studentId: input.studentId,
    examSessionId: active.activeExamId,
  }, trace);
  if (cached) {
    trace?.done("cache_hit");
    return cached.result;
  }

  const student = await prisma.student.findFirst({
    where: {
      ...(input.studentId ? { id: input.studentId } : { examNo: input.examNo.trim() }),
      examSessionId: active.activeExamId,
    },
    include: {
      examSession: { include: { subjects: { orderBy: { sortOrder: "asc" } } } },
      resultSnapshots: { where: { examSessionId: active.activeExamId } },
    },
  });
  trace?.mark("fallback_student_with_subjects", { found: Boolean(student) });

  if (!student) {
    trace?.done("not_found");
    return null;
  }

  const peerSnapshots = await getPublishedPeerSnapshots(active.activeExamId);
  trace?.mark("fallback_peer_snapshots", { count: peerSnapshots.length });

  const result = buildPrivateResult(active.settings, student, peerSnapshots);
  trace?.done(result ? "fallback_built" : "fallback_no_result");
  return result;
}

export async function bindLineStudent(input: { lineUserId: string; examNo: string; lineName?: string | null }) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const trimmedExamNo = input.examNo.trim();

  const student = await prisma.student.findFirst({
    where: {
      examNo: trimmedExamNo,
      ...(settings.activeExamSessionId ? { examSessionId: settings.activeExamSessionId } : {}),
    },
    include: {
      examSession: { include: { subjects: { orderBy: { sortOrder: "asc" } } } },
      resultSnapshots: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!student) {
    return { ok: false as const, error: "ไม่พบรหัสนักเรียนนี้ในรอบสอบ" };
  }

  const existingStudentBinding = await prisma.lineBinding.findUnique({
    where: {
      studentId_examSessionId: {
        studentId: student.id,
        examSessionId: student.examSessionId,
      },
    },
  });
  if (existingStudentBinding && existingStudentBinding.lineUserId !== input.lineUserId) {
    return { ok: false as const, error: "รหัสนักเรียนนี้ผูกกับบัญชี LINE อื่นแล้ว" };
  }

  await prisma.lineBinding.upsert({
    where: {
      lineUserId_examSessionId: {
        lineUserId: input.lineUserId,
        examSessionId: student.examSessionId,
      },
    },
    update: {
      studentId: student.id,
      lineName: input.lineName ?? null,
    },
    create: {
      lineUserId: input.lineUserId,
      lineName: input.lineName ?? null,
      studentId: student.id,
      examSessionId: student.examSessionId,
    },
  });

  const result = student.examSession.status === "PUBLISHED"
    ? (await findPublishedStudentResultSession({
        examNo: student.examNo,
        studentId: student.id,
        examSessionId: student.examSessionId,
      }))?.result ?? null
    : null;
  return {
    ok: true as const,
    student: {
      examNo: student.examNo,
      name: student.name,
      classLevel: student.classLevel,
      room: student.room,
    },
    exam: {
      id: student.examSession.id,
      name: student.examSession.name,
      status: student.examSession.status,
    },
    result,
  };
}

export async function getLineBoundResult(input: { lineUserId: string }) {
  const traceStartedAt = Date.now();
  const marks: Array<Record<string, unknown>> = [];
  let previousAt = traceStartedAt;
  const mark = (label: string, extra: Record<string, unknown> = {}) => {
    const now = Date.now();
    marks.push({
      label,
      elapsedMs: now - traceStartedAt,
      deltaMs: now - previousAt,
      ...extra,
    });
    previousAt = now;
  };
  const done = (outcome: string, extra: Record<string, unknown> = {}) => {
    if (process.env.RESULT_LOOKUP_DEBUG !== "1") return;
    console.info("[line-result-lookup]", {
      outcome,
      totalMs: Date.now() - traceStartedAt,
      region: process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_REGION || "local",
      marks,
      ...extra,
    });
  };

  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  mark("settings_lookup", { hasActiveExam: Boolean(settings.activeExamSessionId) });
  const bindingSelect = {
    lineUserId: true,
    studentId: true,
    examSessionId: true,
    student: { select: { examNo: true } },
    examSession: { select: { status: true } },
  } satisfies Prisma.LineBindingSelect;
  const binding = settings.activeExamSessionId
    ? await prisma.lineBinding.findUnique({
        where: {
          lineUserId_examSessionId: {
            lineUserId: input.lineUserId,
            examSessionId: settings.activeExamSessionId,
          },
        },
        select: bindingSelect,
      })
    : await prisma.lineBinding.findFirst({
        where: { lineUserId: input.lineUserId },
        select: bindingSelect,
        orderBy: { updatedAt: "desc" },
      });
  mark("binding_lookup", { found: Boolean(binding) });

  if (!binding) {
    done("not_bound");
    return { ok: false as const, error: "ยังไม่ได้ผูกบัญชี LINE กับรหัสนักเรียน" };
  }
  if (binding.examSession.status !== "PUBLISHED") {
    done("not_published");
    return { ok: false as const, error: "ผูกบัญชีแล้ว แต่รอบสอบยังไม่ได้ประกาศผล" };
  }

  // ใช้ผลลัพธ์ที่ผ่าน Next.js cache ตัวเดียวกับฝั่งเว็บ (revalidate 300 + tag)
  // เดิม LINE เรียก findPublishedStudentResultSession ตรง ๆ = ข้าม cache ทำ DB query ทุกครั้ง
  // dynamic import กันวงจร import (cache -> repository อยู่แล้ว)
  const { getCachedPublishedStudentResultSession } = await import("@/lib/public-student-result-cache");
  const published = await getCachedPublishedStudentResultSession({
    examNo: binding.student.examNo,
    studentId: binding.studentId,
    examSessionId: binding.examSessionId,
  });
  mark("public_result_lookup", {
    found: Boolean(published),
    cacheMissing: Boolean(published && "cacheMissing" in published),
  });

  if (published && "cacheMissing" in published) {
    console.warn("LINE result cache missing; skipping slow private fallback", {
      examSessionId: binding.examSessionId,
      studentId: binding.studentId,
    });
    done("cache_missing");
    return {
      ok: false as const,
      error: "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง หรือแจ้งผู้ดูแลให้ตรวจแคชผลประกาศ",
    };
  }

  const result = published?.result ?? null;
  if (!result) {
    done("not_found");
    return { ok: false as const, error: "ยังไม่พบผลคะแนนของรหัสที่ผูกไว้" };
  }
  done("cache_hit");
  return {
    ok: true as const,
    result,
    lookup: {
      lineUserId: binding.lineUserId,
      examNo: binding.student.examNo,
      studentId: binding.studentId,
      examSessionId: binding.examSessionId,
    },
  };
}

export async function verifyLineResultWebLookup(input: LineResultWebLookup) {
  const prisma = getPrisma();
  const binding = await prisma.lineBinding.findFirst({
    where: {
      lineUserId: input.lineUserId,
      studentId: input.studentId,
      examSessionId: input.examSessionId,
      student: { examNo: input.examNo },
      examSession: { status: "PUBLISHED" },
    },
    include: {
      student: {
        select: {
          examNo: true,
        },
      },
    },
  });

  if (!binding) return null;

  return {
    examNo: binding.student.examNo,
    studentId: binding.studentId,
    examSessionId: binding.examSessionId,
  };
}

export async function getLineBindingStatus(input: { lineUserId: string }) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const binding = await prisma.lineBinding.findFirst({
    where: {
      lineUserId: input.lineUserId,
      ...(settings.activeExamSessionId ? { examSessionId: settings.activeExamSessionId } : {}),
    },
    include: {
      student: true,
      examSession: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!binding) return { ok: false as const, error: "ยังไม่ได้ผูกบัญชี LINE กับรหัสนักเรียน" };

  return {
    ok: true as const,
    student: {
      examNo: binding.student.examNo,
      name: binding.student.name,
      classLevel: binding.student.classLevel,
      room: binding.student.room,
    },
    exam: {
      id: binding.examSession.id,
      name: binding.examSession.name,
      status: binding.examSession.status,
    },
    // token เปิดหน้าผลเว็บได้เลย (ใช้ได้เมื่อรอบสอบ PUBLISHED) — ไม่ต้องกรอกรหัสซ้ำ
    resultWebToken: signLineResultWebToken({
      lineUserId: input.lineUserId,
      examNo: binding.student.examNo,
      studentId: binding.studentId,
      examSessionId: binding.examSessionId,
    }),
  };
}

export async function findUnpublishedStudentExam(input: { examNo: string }) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const trimmedExamNo = input.examNo.trim();

  const student = await prisma.student.findFirst({
    where: {
      examNo: trimmedExamNo,
      ...(settings.activeExamSessionId ? { examSessionId: settings.activeExamSessionId } : {}),
      examSession: { status: { not: "PUBLISHED" } },
    },
    include: {
      examSession: true,
      resultSnapshots: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!student) return null;

  return {
    examName: student.examSession.name,
    hasCalculatedResult: student.resultSnapshots.some((snapshot) => snapshot.examSessionId === student.examSessionId),
  };
}

// บันทึกประวัติการเข้าดูผล (upsert 1 แถวต่อนักเรียนต่อรอบสอบที่ประกาศแล้ว) — เบา ไม่บล็อกผู้ใช้
export async function recordResultView(input: { examNo: string; channel?: string }) {
  const examNo = input.examNo.trim();
  if (!examNo) return { ok: false as const };
  const active = await getActivePublishedExamId();
  if (!active) return { ok: false as const };

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examSessionId_examNo: { examSessionId: active.activeExamId, examNo } },
    select: { name: true, room: true },
  });
  if (!student) return { ok: false as const };

  const channel = input.channel === "line" ? "line" : "web";
  const now = new Date();
  await prisma.resultView.upsert({
    where: { examSessionId_examNo: { examSessionId: active.activeExamId, examNo } },
    create: {
      examSessionId: active.activeExamId,
      examNo,
      name: student.name,
      room: student.room,
      channel,
      firstViewedAt: now,
      lastViewedAt: now,
    },
    update: {
      viewCount: { increment: 1 },
      lastViewedAt: now,
      channel,
      name: student.name,
      room: student.room,
    },
  });
  return { ok: true as const };
}

// อ่านประวัติการเข้าดูผลของรอบสอบ (สำหรับหน้า admin) — เรียงเข้าล่าสุดก่อน
export async function getResultViews(examSessionId: string) {
  const prisma = getPrisma();
  return prisma.resultView.findMany({
    where: { examSessionId },
    orderBy: { lastViewedAt: "desc" },
    select: {
      examNo: true,
      name: true,
      room: true,
      channel: true,
      viewCount: true,
      firstViewedAt: true,
      lastViewedAt: true,
    },
  });
}

// รายงานการเข้าดูผล: รวมนักเรียน "ทั้งหมด" + คะแนน/อันดับ + สถานะการเข้าดู
// ใช้แยกแท็บ "เข้าดูแล้ว" / "ยังไม่เข้าดู" + เรียงตามคะแนน/ห้อง/ล่าสุด ในหน้า admin
export async function getResultViewReport(examSessionId: string) {
  const prisma = getPrisma();
  const [students, snapshots, views] = await Promise.all([
    prisma.student.findMany({
      where: { examSessionId },
      select: { id: true, examNo: true, name: true, room: true },
    }),
    prisma.resultSnapshot.findMany({
      where: { examSessionId },
      select: { studentId: true, totalScore: true, rank: true, status: true },
    }),
    prisma.resultView.findMany({
      where: { examSessionId },
      select: { examNo: true, channel: true, viewCount: true, lastViewedAt: true },
    }),
  ]);

  const snapByStudent = new Map(snapshots.map((snap) => [snap.studentId, snap]));
  const viewByExamNo = new Map(views.map((view) => [view.examNo, view]));

  return students.map((student) => {
    const snap = snapByStudent.get(student.id);
    const view = viewByExamNo.get(student.examNo);
    return {
      examNo: student.examNo,
      name: student.name,
      room: student.room,
      totalScore: snap?.totalScore ?? null,
      rank: snap?.rank ?? null,
      status: snap?.status ?? null,
      viewed: Boolean(view),
      channel: view?.channel ?? null,
      viewCount: view?.viewCount ?? 0,
      lastViewedAt: view ? view.lastViewedAt.toISOString() : null,
    };
  });
}
