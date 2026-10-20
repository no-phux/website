/** Jev (TypeSafe System One) client and probability helpers for seo.ts. */
// Same contract as ops/analytics/src/typesafe.ts; secrets never leave env.
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

export type Question =
  | { type: "noul"; instructions: string | Record<string, unknown>; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string | Record<string, unknown>; criteria: Record<string, string> };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };

export interface Judge {
  (state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>>;
}

export function jevJudge(apiKey = process.env.TYPESAFE_API_KEY, fetchImpl: typeof fetch = fetch): Judge {
  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY is not set. Run `dot-secrets-sync` and open a fresh shell; never paste the key.");
  }
  return async (state, questions) => {
    const response = await fetchImpl(TYPESAFE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`typesafe ${response.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text) as { answers?: Record<string, Answer> };
    if (!body.answers || typeof body.answers !== "object") throw new Error("typesafe returned no answers");
    return body.answers;
  };
}

export function noul(answers: Record<string, Answer>, id: string): number {
  const answer = answers[id];
  return answer?.type === "noul" && Number.isFinite(answer.noul) ? answer.noul : 0;
}

export function choice(answers: Record<string, Answer>, id: string): { value: string; confidence: number } {
  const answer = answers[id];
  return answer?.type === "choice" ? { value: answer.choice, confidence: answer.confidence } : { value: "", confidence: 0 };
}

/** Starting thresholds from SEO.md; the 50-row calibration sets the real ones. */
export type Band = "act" | "check" | "review";
export function band(p: number): Band {
  if (p >= 0.9) return "act";
  if (p >= 0.5) return "check";
  return "review";
}

/** Bounded-concurrency map; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

