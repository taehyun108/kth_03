import { INVESTORS, type InvestorDef } from "./investors.generated";
import { MAX_PROMPT_CHARS, type Llm } from "./judge";
import type { NewsItem } from "./news";

/** 산업 평가 3단계: 앞으로 크는 시장 / 제자리 / 수면기(침체). */
export type Stance = "성장" | "보합" | "침체";
export const STANCES: Stance[] = ["성장", "보합", "침체"];

export type View = {
  investor: string;
  icon: string;
  stance: Stance | null; // null = 판정을 받지 못함
  confidence: number | null;
  reasons: string[];
  error?: string;
};

export type Rebuttal = View & {
  /** 1라운드에서 판정을 바꿨는지. 모르면 null */
  changed: boolean | null;
  /** 다른 투자자 의견에 대한 반박·동의 */
  rebuttal: string;
  /** 2라운드 답을 못 받아 1라운드 판정을 그대로 가져온 경우 */
  carried?: boolean;
};

export type SectorStats = {
  tradingValue: number;
  /** 전체 거래대금 중 이 산업 비중(%) */
  sharePct: number;
  avgChangePct: number;
  leader: string;
  /** 거래량 상위 종목 요약 (이름·등락률) */
  top: string[];
};

export type DebateNews = { title: string; source: string; link: string };

export type Debate = {
  sector: string;
  day: string;
  createdAt: string;
  model: string;
  label: Stance;
  votes: Record<Stance, number>;
  round1: View[];
  round2: Rebuttal[];
  summary: string;
  stats: SectorStats;
  news: DebateNews[];
};

// ── 프롬프트 ────────────────────────────────────────────────────────
/** 투자자 파일 첫 줄('너는 ○○의 투자 원칙으로 …')을 사람 설정으로 쓴다. */
export const personaOf = (inv: InvestorDef): string => inv.template.split("\n")[0].trim();

/** 종목용 프롬프트의 '- ' 기준 줄 중 출력 형식 지시(사자·팔자·중립, 확신도)는 뺀다. */
export const criteriaOf = (inv: InvestorDef): string[] =>
  inv.template.split("\n").filter((l) => l.startsWith("- ") && !/사자|팔자|중립|확신도/.test(l));

export function statsToText(sector: string, s: SectorStats): string {
  return [
    `- 산업: ${sector}`,
    `- 오늘 거래대금: ${Math.round(s.tradingValue / 1e8).toLocaleString("ko-KR")}억원 (전체의 ${s.sharePct.toFixed(1)}%)`,
    `- 거래대금 가중 평균 등락률: ${s.avgChangePct > 0 ? "+" : ""}${s.avgChangePct.toFixed(2)}%`,
    `- 거래대금 1위 종목: ${s.leader}`,
    `- 거래량 상위: ${s.top.join(", ")}`,
  ].join("\n");
}

const newsBlock = (items: NewsItem[] | DebateNews[]): string =>
  items.length ? `\n[최근 뉴스 제목]\n${items.map((n) => `- ${n.title}${n.source ? ` (${n.source})` : ""}`).join("\n")}\n` : "";

/** 프롬프트가 3천 자를 넘으면 뉴스 제목부터 줄인다 (KTH_01 경험: 길면 무료 NVIDIA 가 응답하지 못함). */
function fit(build: (news: NewsItem[]) => string, news: NewsItem[]): string {
  let items = news;
  let prompt = build(items);
  while (prompt.length > MAX_PROMPT_CHARS && items.length > 0) {
    items = items.slice(0, -1);
    prompt = build(items);
  }
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}

const STANCE_HELP = "성장 = 앞으로 커질 시장, 보합 = 지금 수준에서 제자리, 침체 = 수면기에 들어가는 시장";

export function buildRound1Prompt(inv: InvestorDef, sector: string, stats: SectorStats, news: NewsItem[], today: string): string {
  return fit(
    (n) =>
      `${personaOf(inv)}\n[토론 1라운드] 종목이 아니라 '${sector}' 산업 전체를 평가해줘.\n${STANCE_HELP}.\n\n[당신이 평소 보는 기준]\n${criteriaOf(inv).join("\n")}\n\n오늘 날짜: ${today} (한국 시간)\n\n[오늘 거래 현황]\n${statsToText(sector, stats)}\n${newsBlock(n)}
[답변 규칙]
- 위 거래 현황과 뉴스 제목만 근거로 쓰고, 없는 수치는 지어내지 말고 '확인 필요'라고 적어줘.
- 마지막은 반드시 아래 형식으로만 끝내줘.
판정: 성장 / 보합 / 침체 중 하나
확신도: 0~100 사이 숫자
이유:
1. (한 줄)
2. (한 줄)
3. (한 줄)
`,
    news,
  );
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function othersText(others: View[]): string {
  return others
    .map((v) => `- ${v.investor}: ${v.stance ?? "판정 없음"}${v.confidence !== null ? `(확신 ${v.confidence})` : ""} — ${clip(v.reasons.slice(0, 2).join(" / ") || v.error || "", 110)}`)
    .join("\n");
}

export function buildRound2Prompt(inv: InvestorDef, sector: string, stats: SectorStats, mine: View, others: View[], news: NewsItem[], today: string): string {
  return fit(
    (n) =>
      `${personaOf(inv)}\n[토론 2라운드] '${sector}' 산업 토론이야. 다른 투자자들의 1라운드 의견을 읽고, 반박하거나 동의하고, 필요하면 판정을 바꿔줘.\n${STANCE_HELP}.\n\n[당신의 1라운드 의견]\n- ${mine.stance ?? "판정 없음"}(확신 ${mine.confidence ?? "?"}) — ${clip(mine.reasons.join(" / "), 200)}\n\n[다른 투자자의 1라운드 의견]\n${othersText(others)}\n\n오늘 날짜: ${today} (한국 시간)\n\n[오늘 거래 현황]\n${statsToText(sector, stats)}\n${newsBlock(n.slice(0, 6))}
[답변 규칙]
- 반박할 때는 투자자 이름을 들어 무엇이 왜 틀렸는지(또는 맞는지) 말해줘. 근거는 위 자료만 써.
- 마지막은 반드시 아래 형식으로만 끝내줘.
판정: 성장 / 보합 / 침체 중 하나 (바꿔도 되고 유지해도 됨)
확신도: 0~100 사이 숫자
입장: 유지 또는 변경
반박: (한두 문장)
이유: (최종 근거 한 줄)
`,
    news,
  );
}

export function buildSummaryPrompt(sector: string, label: Stance, votes: Record<Stance, number>, finals: Rebuttal[]): string {
  const lines = finals
    .map((f) => `- ${f.investor}: ${f.stance ?? "판정 없음"} — ${clip([f.rebuttal, f.reasons[0]].filter(Boolean).join(" / "), 140)}`)
    .join("\n");
  return `너는 투자 토론의 사회자야. '${sector}' 산업 토론의 최종 결과를 중립적으로 요약해줘.
[최종 투표] 성장 ${votes.성장} · 보합 ${votes.보합} · 침체 ${votes.침체} → 결론: ${label}

[투자자별 최종 입장]
${lines}

[답변 규칙]
- 결론(${label})은 이미 정해졌으니 바꾸지 마. 쟁점과 이유만 정리해줘.
- 입장에 없는 사실은 지어내지 마.
- 아래 형식으로만 답해줘.
요약: (2~3문장. 왜 이런 결론인지, 의견이 갈린 지점은 무엇인지)
`;
}

// ── 답변 해석 ───────────────────────────────────────────────────────
const stanceOf = (text: string): Stance | null => {
  const all = [...text.matchAll(/판정\s*[:：]\s*\[?\s*(성장|보합|침체)/g)];
  return all.length ? (all[all.length - 1][1] as Stance) : null;
};
const confOf = (text: string): number | null => {
  const all = [...text.matchAll(/확신도\s*[:：]\s*\[?\s*(\d{1,3})/g)];
  return all.length ? Math.min(Number(all[all.length - 1][1]), 100) : null;
};
const clean = (t: string): string => (t || "").replace(/\*\*|__/g, "");

export function parseView(inv: Pick<InvestorDef, "name" | "icon">, text: string): View {
  const t = clean(text);
  const reasons: string[] = [];
  const parts = t.split(/이유\s*[:：]/);
  if (parts.length > 1) {
    for (const line of parts[parts.length - 1].split(/\r?\n/)) {
      const m = line.match(/^\s*(?:\d+[.)]|[-•])\s*(.+)/);
      if (m) reasons.push(m[1].trim());
    }
  }
  const stance = stanceOf(t);
  return { investor: inv.name, icon: inv.icon, stance, confidence: confOf(t), reasons: reasons.slice(0, 3), error: stance ? undefined : "판정을 읽지 못함" };
}

export function parseRebuttal(inv: Pick<InvestorDef, "name" | "icon">, text: string): Rebuttal {
  const t = clean(text);
  const stance = stanceOf(t);
  const changeM = t.match(/입장\s*[:：]\s*(유지|변경)/);
  const reb = t.match(/반박\s*[:：]\s*([\s\S]*?)(?=\n\s*이유\s*[:：]|$)/);
  const why = t.match(/이유\s*[:：]\s*([\s\S]*?)$/);
  const reasons = why ? [why[1].replace(/^\s*(?:\d+[.)]|[-•])\s*/, "").split("\n")[0].trim()].filter(Boolean) : [];
  return {
    investor: inv.name,
    icon: inv.icon,
    stance,
    confidence: confOf(t),
    reasons,
    error: stance ? undefined : "판정을 읽지 못함",
    changed: changeM ? changeM[1] === "변경" : null,
    rebuttal: reb ? reb[1].replace(/\s+/g, " ").trim() : "",
  };
}

// ── 다수결 ──────────────────────────────────────────────────────────
/** 가장 많은 표를 받은 쪽. 동수면 확신도 합이 큰 쪽, 그래도 같으면 '보합'. */
export function tally(finals: View[]): { label: Stance; votes: Record<Stance, number> } {
  const votes: Record<Stance, number> = { 성장: 0, 보합: 0, 침체: 0 };
  const conf: Record<Stance, number> = { 성장: 0, 보합: 0, 침체: 0 };
  for (const f of finals) {
    if (!f.stance) continue;
    votes[f.stance]++;
    conf[f.stance] += f.confidence ?? 50;
  }
  const max = Math.max(...STANCES.map((s) => votes[s]));
  let cands = STANCES.filter((s) => votes[s] === max);
  if (cands.length > 1) {
    const maxConf = Math.max(...cands.map((s) => conf[s]));
    cands = cands.filter((s) => conf[s] === maxConf);
  }
  return { label: cands.length === 1 ? cands[0] : "보합", votes };
}

// ── 토론 진행 ───────────────────────────────────────────────────────
export type DebateRun = Omit<Debate, "sector" | "day" | "createdAt" | "model" | "stats" | "news">;
export type DebateOutcome = { ok: true; run: DebateRun } | { ok: false; error: string };

/** 1라운드(각자 의견) → 2라운드(서로 보고 반박·수정) → 사회자 요약. 한 명이 실패해도 계속하되, 1라운드가 절반 미만이면 중단한다. */
export async function runDebate(
  sector: string,
  stats: SectorStats,
  news: NewsItem[],
  llm: Llm,
  today: string,
  investors: InvestorDef[] = INVESTORS,
): Promise<DebateOutcome> {
  const round1 = await Promise.all(
    investors.map(async (inv): Promise<View> => {
      try {
        return parseView(inv, await llm(buildRound1Prompt(inv, sector, stats, news, today)));
      } catch (err) {
        return { investor: inv.name, icon: inv.icon, stance: null, confidence: null, reasons: [], error: err instanceof Error ? err.message.slice(0, 120) : "실패" };
      }
    }),
  );
  const okViews = round1.filter((v) => v.stance !== null);
  if (okViews.length * 2 < investors.length) {
    return { ok: false, error: `1라운드 의견을 충분히 받지 못했습니다 (${okViews.length}/${investors.length}, ${round1.find((v) => v.error)?.error ?? "원인 불명"})` };
  }

  const round2 = await Promise.all(
    investors.map(async (inv, i): Promise<Rebuttal> => {
      const mine = round1[i];
      const carried = (): Rebuttal => ({ ...mine, changed: null, rebuttal: "", carried: true });
      if (mine.stance === null) return carried();
      try {
        const others = round1.filter((_, j) => j !== i && round1[j].stance !== null);
        const r = parseRebuttal(inv, await llm(buildRound2Prompt(inv, sector, stats, mine, others, news, today)));
        if (r.stance === null) return carried();
        // 판정이 바뀌었는데 '입장'을 안 적었다면 판정 비교로 보완한다
        return { ...r, changed: r.changed ?? r.stance !== mine.stance, reasons: r.reasons.length ? r.reasons : mine.reasons.slice(0, 1) };
      } catch {
        return carried();
      }
    }),
  );

  const { label, votes } = tally(round2);
  let summary = "";
  try {
    const text = clean(await llm(buildSummaryPrompt(sector, label, votes, round2)));
    const m = text.match(/요약\s*[:：]\s*([\s\S]*)$/);
    summary = (m ? m[1] : text).replace(/\s+/g, " ").trim().slice(0, 500);
  } catch {
    /* 요약 실패는 아래 기본 문구로 */
  }
  if (!summary) summary = `투표 결과 성장 ${votes.성장} · 보합 ${votes.보합} · 침체 ${votes.침체} (요약 생성에 실패해 투표 결과만 표시합니다)`;

  return { ok: true, run: { label, votes, round1, round2, summary } };
}

/** 이 산업 토론 한 번에 드는 AI 호출 수 (1라운드 N + 2라운드 N + 요약 1). */
export const callsPerDebate = (n: number = INVESTORS.length): number => 2 * n + 1;
