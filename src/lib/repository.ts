import { getPrisma } from "@/lib/prisma";
import { calculateResults } from "@/lib/ranking";
import { verifierHash } from "@/lib/security";
import type { ImportedStudentRow } from "@/lib/excel";
import type { CandidateInput, RankingRule, SubjectInput } from "@/lib/types";

export async function upsertSchoolSettings(input: {
  schoolName: string;
  examTitle?: string;
  logoUrl?: string | null;
  activeExamSessionId?: string | null;
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

  return calculated;
}

export async function publishExam(examSessionId: string) {
  const prisma = getPrisma();
  const snapshotCount = await prisma.resultSnapshot.count({ where: { examSessionId } });
  if (snapshotCount === 0) {
    await calculateExamResults(examSessionId);
  }

  const publishedAt = new Date();
  await prisma.$transaction([
    prisma.examSession.update({
      where: { id: examSessionId },
      data: { status: "PUBLISHED", publishedAt },
    }),
    prisma.resultSnapshot.updateMany({
      where: { examSessionId },
      data: { publishedAt },
    }),
  ]);

  return { publishedAt };
}

export async function checkPrivateResult(input: { examNo: string }) {
  const prisma = getPrisma();
  const settings = await getSchoolSettings();
  const activeExam = settings.activeExamSessionId
    ? await prisma.examSession.findUnique({ where: { id: settings.activeExamSessionId } })
    : await prisma.examSession.findFirst({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } });

  if (!activeExam || activeExam.status !== "PUBLISHED") return null;

  const student = await prisma.student.findFirst({
    where: {
      examNo: input.examNo.trim(),
      examSessionId: activeExam.id,
    },
    include: {
      examSession: { include: { subjects: { orderBy: { sortOrder: "asc" } } } },
      resultSnapshots: true,
    },
  });

  if (!student) return null;

  const result = student.resultSnapshots.find(
    (snapshot) => snapshot.examSessionId === student.examSessionId,
  );
  if (!result) return null;

  const subjectNameById = new Map(student.examSession.subjects.map((subject) => [subject.id, subject.name]));
  const rawBreakdown = result.scoreBreakdown as Record<string, number>;

  return {
    school: settings,
    exam: {
      id: student.examSession.id,
      name: student.examSession.name,
      classLevel: student.examSession.classLevel,
      selectionMode: student.examSession.selectionMode,
      publishedAt: student.examSession.publishedAt,
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
  };
}
