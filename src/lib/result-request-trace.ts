type TraceMark = {
  label: string;
  elapsedMs: number;
  deltaMs: number;
  extra?: Record<string, unknown>;
};

function safeTimingName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createResultRequestTrace(scope: string) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const region = process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_REGION || "local";
  let previousAt = startedAt;
  const marks: TraceMark[] = [];

  return {
    requestId,
    mark(label: string, extra?: Record<string, unknown>) {
      const now = Date.now();
      marks.push({
        label,
        elapsedMs: now - startedAt,
        deltaMs: now - previousAt,
        extra,
      });
      previousAt = now;
    },
    headers() {
      const totalMs = Date.now() - startedAt;
      const timing = [
        ...marks.map((mark) => `${safeTimingName(mark.label)};dur=${Math.max(0, mark.deltaMs)}`),
        `total;dur=${Math.max(0, totalMs)}`,
      ].join(", ");
      return {
        "Cache-Control": "private, no-store, max-age=0",
        "Server-Timing": timing,
        "X-Result-Region": region,
        "X-Result-Request-Id": requestId,
      };
    },
    done(outcome: string, extra?: Record<string, unknown>) {
      if (process.env.RESULT_LOOKUP_DEBUG !== "1") return;
      console.info("[result-request]", {
        scope,
        outcome,
        requestId,
        region,
        totalMs: Date.now() - startedAt,
        marks,
        ...extra,
      });
    },
  };
}
