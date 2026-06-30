export type ScoreDraftEdits = Record<string, Record<string, string>>;
export type ScoreDraftAbsentEdits = Record<string, boolean>;

export type ScoreDraft = {
  edits: ScoreDraftEdits;
  absentEdits: ScoreDraftAbsentEdits;
  updatedAt: number;
};

export const scoreDraftChangedEventName = "score-entry-draft-changed";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function scoreDraftStorageKey(examId: string) {
  return `score_entry_pending_v1:${examId}`;
}

export function countScoreDraftChanges(draft: Pick<ScoreDraft, "edits" | "absentEdits">) {
  const scoreChanges = Object.values(draft.edits).reduce((sum, row) => sum + Object.keys(row).length, 0);
  return scoreChanges + Object.keys(draft.absentEdits).length;
}

export function readScoreDraft(examId: string): ScoreDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(scoreDraftStorageKey(examId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScoreDraft>;
    const draft: ScoreDraft = {
      edits: parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
      absentEdits: parsed.absentEdits && typeof parsed.absentEdits === "object" ? parsed.absentEdits : {},
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
    return countScoreDraftChanges(draft) > 0 ? draft : null;
  } catch {
    return null;
  }
}

export function writeScoreDraft(examId: string, edits: ScoreDraftEdits, absentEdits: ScoreDraftAbsentEdits) {
  if (!canUseStorage()) return;
  try {
    const draft: ScoreDraft = { edits, absentEdits, updatedAt: Date.now() };
    if (countScoreDraftChanges(draft) === 0) {
      clearScoreDraft(examId);
      return;
    }
    window.localStorage.setItem(scoreDraftStorageKey(examId), JSON.stringify(draft));
    window.dispatchEvent(new CustomEvent(scoreDraftChangedEventName, { detail: { examId } }));
  } catch {
    // Storage may be unavailable in private browsing or full devices. The in-memory autosave still works.
  }
}

export function clearScoreDraft(examId: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(scoreDraftStorageKey(examId));
    window.dispatchEvent(new CustomEvent(scoreDraftChangedEventName, { detail: { examId } }));
  } catch {
    // Ignore storage failures.
  }
}

export function hasPendingScoreDraft(examId: string) {
  return Boolean(readScoreDraft(examId));
}
