import { INVESTORS } from "./investors.generated";
import { factsForJudge } from "./fundamentals";
import { judgeStock, kstDay, type Judgment } from "./judge";
import { fetchNews, type NewsItem } from "./news";
import { nvidiaChat, nvidiaModel } from "./nvidia";
import { consumeAiCalls, getJudgment, hasSupabase, saveJudgment } from "./store";
import { getFundamentals } from "./fundamentalsSource";

export type JudgmentResult =
  | { ok: true; judgment: Judgment; cached: boolean }
  | { ok: false; status: number; error: string };

/**
 * 종목 하나의 투자자 판단을 만든다(웹 요청·Actions 공용).
 * 오늘 이미 만든 것이 있으면 그대로 돌려주고(AI 호출 없음), 없으면 하루 상한을 확인한 뒤 만든다.
 */
export async function createJudgment(code: string): Promise<JudgmentResult> {
  // 운영에서 저장소가 없으면 하루 상한을 지킬 수 없으므로 AI 를 부르지 않는다 (비용 보호, fail closed)
  if (process.env.NODE_ENV === "production" && !hasSupabase()) {
    return { ok: false, status: 503, error: "저장소(Supabase)가 연결되지 않아 AI 판단을 쓸 수 없습니다. 하루 호출 상한을 지킬 수 없기 때문입니다." };
  }
  const day = kstDay();
  const cached = await getJudgment(code, day);
  if (cached) return { ok: true, judgment: cached, cached: true };

  let fundamentals;
  try {
    fundamentals = (await getFundamentals(code)).f;
  } catch (err) {
    return { ok: false, status: 502, error: `재무 데이터를 불러오지 못했습니다 (${err instanceof Error ? err.message : "알 수 없음"})` };
  }
  let news: NewsItem[] = [];
  try {
    news = await fetchNews(fundamentals.name);
  } catch {
    /* 뉴스가 없어도 수치만으로 판단한다 */
  }

  const calls = INVESTORS.length;
  if (!(await consumeAiCalls(day, calls))) {
    return { ok: false, status: 429, error: "오늘 AI 호출 한도를 모두 사용했습니다. 내일 다시 시도해 주세요." };
  }

  const opinions = await judgeStock(fundamentals.name, factsForJudge(fundamentals), news, nvidiaChat, day);
  const okCount = opinions.filter((o) => o.verdict !== "판단불가").length;
  if (okCount === 0) {
    await consumeAiCalls(day, -calls).catch(() => undefined); // 전부 실패하면 호출 횟수를 돌려준다
    return { ok: false, status: 502, error: `AI 판단을 받지 못했습니다 (${opinions[0]?.error ?? "원인 불명"})` };
  }

  const judgment: Judgment = { code, name: fundamentals.name, day, createdAt: new Date().toISOString(), model: nvidiaModel(), opinions };
  if (okCount * 2 >= opinions.length) await saveJudgment(judgment); // 절반 이상 성공했을 때만 저장
  return { ok: true, judgment, cached: false };
}
