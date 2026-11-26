import { INVESTORS, type InvestorDef } from "./investors.generated";
import type { NewsItem } from "./news";

export type Verdict = "사자" | "팔자" | "중립" | "판단불가";

export type Opinion = {
  investor: string;
  icon: string;
  verdict: Verdict;
  confidence: number | null;
  reasons: string[];
  error?: string;
};

export type Judgment = {
  code: string;
  name: string;
  /** 판단을 만든 한국 날짜 (YYYY-MM-DD) */
  day: string;
  createdAt: string;
  model: string;
  opinions: Opinion[];
};

/** 화면용 라벨. 코드·프롬프트는 사자/팔자/중립, 화면은 기존 브리핑처럼 매수/매도/관망. */
export const VERDICT_LABEL: Record<Verdict, string> = { 사자: "매수", 팔자: "매도", 중립: "관망", 판단불가: "판단불가" };

export const MAX_PROMPT_CHARS = 3000; // KTH_01 경험: 입력이 길면 무료 NVIDIA 가 응답하지 못한다

const ANSWER_RULES = `
[답변 규칙]
- 아래 [확정 수치]와 [최근 뉴스 제목]만 근거로 쓰고, 목록에 없는 수치는 지어내지 말고 '확인 필요'라고 적어줘.
- [확정 수치]를 말할 때는 반드시 그 값 그대로 쓰고, 다른 숫자를 만들어 쓰지 마.
- 마지막은 반드시 아래 형식으로만 끝내줘.
판정: 사자 / 팔자 / 중립 중 하나
확신도: 0~100 사이 숫자
이유:
1. (한 줄)
2. (한 줄)
3. (한 줄)
`;

export function factsToText(facts: Record<string, string>): string {
  return Object.entries(facts)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

/** 투자자 프롬프트 + 확정 수치 + 뉴스 제목. 3천 자를 넘으면 뉴스 제목부터 줄인다. */
export function buildPrompt(inv: InvestorDef, target: string, facts: Record<string, string>, news: NewsItem[], today: string): string {
  const head = `${inv.template.replace(/\[종목\]/g, target)}\n\n오늘 날짜: ${today} (한국 시간)\n\n[확정 수치]\n${factsToText(facts)}\n`;
  const build = (items: NewsItem[]) =>
    head + (items.length ? `\n[최근 뉴스 제목]\n${items.map((n) => `- ${n.title}${n.source ? ` (${n.source})` : ""}`).join("\n")}\n` : "") + ANSWER_RULES;
  let items = news;
  let prompt = build(items);
  while (prompt.length > MAX_PROMPT_CHARS && items.length > 0) {
    items = items.slice(0, -1);
    prompt = build(items);
  }
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}

export function parseOpinion(investor: string, icon: string, text: string): Opinion {
  const clean = (text || "").replace(/\*\*|__/g, "");
  const verdicts = [...clean.matchAll(/판정\s*[:：]\s*\[?\s*(사자|팔자|중립)/g)].map((m) => m[1] as Verdict);
  const confs = [...clean.matchAll(/확신도\s*[:：]\s*\[?\s*(\d{1,3})/g)].map((m) => Number(m[1]));
  const reasons: string[] = [];
  const parts = clean.split(/이유\s*[:：]/);
  if (parts.length > 1) {
    for (const line of parts[parts.length - 1].split(/\r?\n/)) {
      const m = line.match(/^\s*(?:\d+[.)]|[-•])\s*(.+)/);
      if (m) reasons.push(m[1].trim());
    }
  }
  if (verdicts.length === 0) {
    return { investor, icon, verdict: "판단불가", confidence: null, reasons: reasons.slice(0, 3), error: "판정을 읽지 못함" };
  }
  return {
    investor,
    icon,
    verdict: verdicts[verdicts.length - 1],
    confidence: confs.length ? Math.min(confs[confs.length - 1], 100) : null,
    reasons: reasons.slice(0, 3),
  };
}

export type Llm = (prompt: string) => Promise<string>;

/** 투자자 전원에게 같은 근거를 주고 각자 판단하게 한다. 한 명이 실패해도 나머지는 계속된다. */
export async function judgeStock(
  target: string,
  facts: Record<string, string>,
  news: NewsItem[],
  llm: Llm,
  today: string,
  investors: InvestorDef[] = INVESTORS,
): Promise<Opinion[]> {
  return Promise.all(
    investors.map(async (inv): Promise<Opinion> => {
      try {
        return parseOpinion(inv.name, inv.icon, await llm(buildPrompt(inv, target, facts, news, today)));
      } catch (err) {
        return { investor: inv.name, icon: inv.icon, verdict: "판단불가", confidence: null, reasons: [], error: err instanceof Error ? err.message.slice(0, 120) : "실패" };
      }
    }),
  );
}

export const kstDay = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
