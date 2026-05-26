import { getPrisma } from "@/lib/prisma";
import { calculateResults } from "@/lib/ranking";
import { verifierHash } from "@/lib/security";
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
    status: "PASSED" | "FAILED" | "REVIEW";
    reason: string;
    scoreBreakdown: Record<string, number>;
  };
  statistics: {
    total: {
      score: number;
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
      roomAverage: number;
      levelAverage: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    }>;
  };
};

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
    subjects: Array<{ id: string; name: string }>;
  };
  resultSnapshots: Array<{
    examSessionId: string;
    rank: number;
    totalScore: number;
    status: "PASSED" | "FAILED" | "REVIEW";
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
  status: "PASSED" | "FAILED" | "REVIEW";
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
  subjects: Array<{ id: string; name: string }>;
};

const peerSnapshotMemoryCache = new Map<string, { expiresAt: number; data: PeerResultSnapshot[] }>();
const peerSnapshotCacheMs = 60_000;

export async function upsertSchoolSettings(input: {
  schoolName: string;
  examTitle?: string;
  logoUrl?: string | null;
  activeExamSessionId?: string | null;
  schoolContact?: string | null;
}) {
  const prisma = getPrisma();
  return prisma.schoolSettings.upsert({
    where: { id: "main" },
    update: input,
    create: { id: "main", ...input },
  });
}

export async function getSchoolSettings() {
  const prisma = getPrisma();
  return prisma.schoolSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
}

export async function getPublicResultSettings() {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const activeExam = settings.activeExamSessionId
    ? await prisma.examSession.findUnique({
        where: { id: settings.activeExamSessionId },
        select: { id: true, name: true, classLevel: true, status: true, publishedAt: true },
      })
    : await prisma.examSession.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { id: true, name: true, classLevel: true, status: true, publishedAt: true },
      });

  return { ...settings, activeExam };
}

export async function createExamSession(input: {
  name: string;
  classLevel: string;
  selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
  wholeLevelQuota?: number | null;
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

export async function saveExamRooms(
  examSessionId: string,
  rooms: Array<{ room: string; quota: number }>,
) {
  const prisma = getPrisma();
  const uniqueRooms = new Set(rooms.map((room) => room.room.trim()).filter(Boolean));
  if (uniqueRooms.size !== rooms.length) {
    throw new Error("ชื่อห้องซ้ำหรือว่าง");
  }

  return prisma.$transaction([
    prisma.roomQuota.deleteMany({ where: { examSessionId } }),
    prisma.roomQuota.createMany({
      data: rooms.map((room) => ({
        examSessionId,
        room: room.room.trim(),
        quota: Number(room.quota || 0),
      })),
    }),
  ]);
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
}) {
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
      if (!(subject.name in row)) {
        errors.push(`แถว ${index + 2}: ไม่พบคอลัมน์วิชา ${subject.name}`);
        continue;
      }

      const value = Number(row[subject.name]);
      if (!Number.isFinite(value)) {
        errors.push(`แถว ${index + 2}: คะแนนวิชา ${subject.name} ไม่ใช่ตัวเลข`);
        scores[subject.id] = 0;
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
}) {
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id: input.examSessionId },
    include: { subjects: { orderBy: { sortOrder: "asc" } } },
  });
  if (!exam) throw new Error("ไม่พบรอบสอบ");

  const normalized = normalizeRoomImportRows({
    rawRows: input.rawRows,
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

  const candidates: CandidateInput[] = exam.students.map((student) => ({
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

  await prisma.$transaction([
    prisma.resultSnapshot.deleteMany({ where: { examSessionId } }),
    prisma.resultSnapshot.createMany({
      data: calculated.map((result) => ({
        examSessionId,
        studentId: result.studentId,
        rank: result.rank,
        totalScore: result.totalScore,
        status: result.status,
        reason: result.reason,
        scoreBreakdown: result.scoreBreakdown,
        tieBreakValues: result.tieBreakValues,
      })),
    }),
  ]);
  peerSnapshotMemoryCache.delete(examSessionId);
  await rebuildPublicResultCache(examSessionId);

  return calculated;
}

export async function publishExam(
  examSessionId: string,
  announcement?: { passTitle?: string | null; passInstructions?: string | null },
) {
  const prisma = getPrisma();
  const snapshotCount = await prisma.resultSnapshot.count({ where: { examSessionId } });
  if (snapshotCount === 0) {
    await calculateExamResults(examSessionId);
  }

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
  await rebuildPublicResultCache(examSessionId);

  return { publishedAt };
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
  return { deleted: deleted.count };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function publicSchoolFromSettings(settings: Awaited<ReturnType<typeof getSchoolSettings>>) {
  return {
    schoolName: settings.schoolName,
    examTitle: settings.examTitle,
    logoUrl: settings.logoUrl,
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
  const levelStats = buildGroupStats(snapshots, exam.subjects);
  const snapshotsByRoom = new Map<string, PublicResultSnapshotInput[]>();
  for (const snapshot of snapshots) {
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
  await prisma.$transaction(
    exam.resultSnapshots.map((snapshot) =>
      prisma.resultSnapshot.update({
        where: {
          examSessionId_studentId: {
            examSessionId,
            studentId: snapshot.studentId,
          },
        },
        data: {
          publicResultData: payloads.get(snapshot.studentId) as Prisma.InputJsonValue,
          publicResultBuiltAt: builtAt,
        },
      }),
    ),
  );

  return { updated: exam.resultSnapshots.length };
}

async function getActivePublishedExamId(input?: { examSessionId?: string }) {
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

export async function findPublishedStudentResultLookup(input: { examNo: string }) {
  const prisma = getPrisma();
  const active = await getActivePublishedExamId();
  if (!active) return null;

  const student = await prisma.student.findFirst({
    where: {
      examNo: input.examNo.trim(),
      examSessionId: active.activeExamId,
      resultSnapshots: { some: { examSessionId: active.activeExamId } },
    },
    select: { id: true, examNo: true, examSessionId: true },
  });

  if (!student) return null;
  return { examNo: student.examNo, studentId: student.id, examSessionId: student.examSessionId };
}

export async function findPublishedStudentResultSession(input: { examNo: string }) {
  const prisma = getPrisma();
  const active = await getActivePublishedExamId();
  if (!active) return null;

  const snapshot = await prisma.resultSnapshot.findFirst({
    where: {
      examSessionId: active.activeExamId,
      student: {
        examNo: input.examNo.trim(),
        examSessionId: active.activeExamId,
      },
    },
    select: {
      publicResultData: true,
      student: {
        select: {
          id: true,
          examNo: true,
          examSessionId: true,
        },
      },
    },
  });

  if (!snapshot) return null;

  const lookup = {
    examNo: snapshot.student.examNo,
    studentId: snapshot.student.id,
    examSessionId: snapshot.student.examSessionId,
  };
  const cached = normalizeCachedPublicResult(active.settings, snapshot.publicResultData);
  if (cached) return { lookup, result: cached };

  const result = await checkPrivateResult(lookup);
  return result ? { lookup, result } : null;
}

async function findCachedPublicResult(
  settings: Awaited<ReturnType<typeof getSchoolSettings>>,
  input: { examNo: string; studentId?: string; examSessionId: string },
) {
  const prisma = getPrisma();
  const snapshot = await prisma.resultSnapshot.findFirst({
    where: {
      examSessionId: input.examSessionId,
      ...(input.studentId ? { studentId: input.studentId } : { student: { examNo: input.examNo.trim() } }),
    },
    select: {
      publicResultData: true,
    },
  });

  return normalizeCachedPublicResult(settings, snapshot?.publicResultData);
}

export async function checkPrivateResult(input: { examNo: string; studentId?: string; examSessionId?: string }) {
  const prisma = getPrisma();
  const active = await getActivePublishedExamId({ examSessionId: input.examSessionId });
  if (!active) return null;

  const cached = await findCachedPublicResult(active.settings, {
    examNo: input.examNo,
    studentId: input.studentId,
    examSessionId: active.activeExamId,
  });
  if (cached) return cached;

  await rebuildPublicResultCache(active.activeExamId).catch((error) => {
    console.error("Public result cache backfill failed", error);
  });
  const rebuilt = await findCachedPublicResult(active.settings, {
    examNo: input.examNo,
    studentId: input.studentId,
    examSessionId: active.activeExamId,
  });
  if (rebuilt) return rebuilt;

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

  if (!student) return null;

  const peerSnapshots = await getPublishedPeerSnapshots(active.activeExamId);

  return buildPrivateResult(active.settings, student, peerSnapshots);
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
    ? await checkPrivateResult({
        examNo: student.examNo,
        studentId: student.id,
        examSessionId: student.examSessionId,
      })
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
  if (binding.examSession.status !== "PUBLISHED") {
    return { ok: false as const, error: "ผูกบัญชีแล้ว แต่รอบสอบยังไม่ได้ประกาศผล" };
  }

  const result = await checkPrivateResult({
    examNo: binding.student.examNo,
    studentId: binding.studentId,
    examSessionId: binding.examSessionId,
  });
  if (!result) return { ok: false as const, error: "ยังไม่พบผลคะแนนของรหัสที่ผูกไว้" };
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
