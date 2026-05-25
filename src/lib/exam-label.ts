export type ExamLabelInput = {
  name: string;
  status: string;
  _count?: {
    students?: number;
  };
};

export function formatExamOptionLabel(exam: ExamLabelInput) {
  return `${exam.name} / ${exam.status} / ${exam._count?.students ?? 0} คน`;
}
