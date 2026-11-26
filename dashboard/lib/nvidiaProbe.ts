/** `npm run nvidia:probe` 의 판단 로직 — 어떤 모델을 시험하고, 답을 어떻게 분류할지. (실제 호출은 scripts/probe-nvidia.ts) */

/** 일반 instruct 모델을 우선한다. 앞에 있을수록 먼저 시험한다. */
export const PREFER = ["llama-3.3-70b", "llama-3.1-70b", "nemotron", "qwen2.5", "qwen", "mistral-small", "mixtral", "gemma-2", "llama-3.1-8b", "llama-3"];

/** 대화 모델이 아닌 것들(임베딩·안전 필터·이미지·음성·코드 등)은 시험하지 않는다. */
const EXCLUDE = /embed|rerank|guard|safety|reward|vision|-vl|vlm|clip|parse|translate|riva|tts|asr|image|diffusion|sdxl|flux|stable|coder|code|pii|ocr|retriev|bge|moderation|synthetic|audio|speech|whisper|nemoretriever|topic-control|content-safety/i;

/** 시험할 모델 목록: 현재 설정된 모델을 맨 앞에, 그다음 카탈로그에서 일반 대화 모델을 우선순위대로. */
export function pickCandidates(ids: string[], current: string, max = 8): string[] {
  const rank = (id: string): number => {
    const i = PREFER.findIndex((p) => id.toLowerCase().includes(p));
    if (i >= 0) return i;
    return /instruct|chat|-it$/i.test(id) ? PREFER.length : -1;
  };
  const ranked = ids
    .filter((id) => id !== current && !EXCLUDE.test(id) && rank(id) >= 0)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  // 같은 계열(예: 70b 여러 개)만 도배되지 않게 우선순위 키워드마다 최대 2개
  const perKey = new Map<number, number>();
  const picked: string[] = [];
  for (const id of ranked) {
    const k = rank(id);
    if ((perKey.get(k) ?? 0) >= 2) continue;
    perKey.set(k, (perKey.get(k) ?? 0) + 1);
    picked.push(id);
  }
  return [current, ...picked].slice(0, max);
}

export type ProbeVerdict = "ok" | "format" | "empty" | "error";

/** 답을 분류: ok=판정 형식을 지킴, format=답은 있으나 '판정: 사자/팔자/중립' 형식이 아님. 앱(parseOpinion)과 같은 기준이라 굵은 글씨(**)는 허용한다. */
export function classifyAnswer(text: string): ProbeVerdict {
  return /판정\s*[:：]\s*\[?\s*(사자|팔자|중립)/.test(text.replace(/\*\*|__/g, "")) ? "ok" : "format";
}
