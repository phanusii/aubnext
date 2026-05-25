import { getPrisma } from "@/lib/prisma";
import { calculateResults } from "@/lib/ranking";
import { verifierHash } from "@/lib/security";
import type { ImportedStudentRow } from "@/lib/excel";
import type { CandidateInput, RankingRule, SubjectInput } from "@/lib/types";

export async function upsertSchoolSettings(input: {
  schoolName: string;
  examTitle: string;
  logoUrl?: string | null;
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

export async function checkPrivateResult(input: { examNo: string; verifier: string }) {
  const prisma = getPrisma();
  const student = await prisma.student.findFirst({
    where: {
      examNo: input.examNo.trim(),
      verifierHash: verifierHash(input.verifier),
      examSession: { status: "PUBLISHED" },
    },
    orderBy: { createdAt: "desc" },
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

  const settings = await getSchoolSettings();
  const subjectNameById = new Map(student.examSession.subjects.map((subject) => [subject.id, subject.name]));
  const rawBreakdown = result.scoreBreakdown as Record<string, number>;

  return {
    school: settings,
    exam: {
      id: student.examSession.id,
      name: student.examSession.name,
      classLevel: student.examSession.classLevel,
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
