import { callsPerDebate, runDebate, type Debate, type SectorStats } from "./debate";
import { fmtPct } from "./format";
import { INVESTORS } from "./investors.generated";
import { kstDay } from "./judge";
import { fetchNewsQueries, type NewsItem } from "./news";
import { nvidiaChat, nvidiaModel } from "./nvidia";
import { sectorTotals, topByVolume } from "./rank";
import { sectorQueries } from "./sectors";
import { consumeAiCalls, getDebate, hasSupabase, saveDebate } from "./store";
import type { Stock } from "./types";

export type DebateResult = { ok: true; debate: Debate; cached: boolean } | { ok: false; status: number; error: string };

export function sectorStats(sector: string, stocks: Stock[]): SectorStats | null {
  const totals = sectorTotals(stocks);
  const mine = totals.find((t) => t.sector === sector);
  if (!mine) return null;
  const all = totals.reduce((sum, t) => sum + t.tradingValue, 0);
  return {
    tradingValue: mine.tradingValue,
    sharePct: all > 0 ? (mine.tradingValue / all) * 100 : 0,
    avgChangePct: mine.avgChangePct,
    leader: mine.leader,
    top: topByVolume(stocks, sector, 5).map((s) => `${s.name}(${fmtPct(s.changePct)})`),
  };
}

/** 산업 하나의 시장 토론을 만든다. 오늘 이미 있으면 그대로 돌려주고, 없으면 하루 AI 호출 상한을 확인한 뒤 만든다. */
export async function createSectorDebate(sector: string, stocks: Stock[]): Promise<DebateResult> {
  if (process.env.NODE_ENV === "production" && !hasSupabase()) {
    return { ok: false, status: 503, error: "저장소(Supabase)가 연결되지 않아 AI 토론을 쓸 수 없습니다. 하루 호출 상한을 지킬 수 없기 때문입니다." };
  }
  const day = kstDay();
  const cached = await getDebate(sector, day);
  if (cached) return { ok: true, debate: cached, cached: true };

  const stats = sectorStats(sector, stocks);
  if (!stats) return { ok: false, status: 404, error: `'${sector}' 산업의 시세 데이터가 없습니다` };

  let news: NewsItem[] = [];
  try {
    news = await fetchNewsQueries(sectorQueries(sector), { limit: 12, maxAgeDays: 7 });
  } catch {
    /* 기사가 없어도 거래 현황만으로 토론한다 */
  }

  const calls = callsPerDebate(INVESTORS.length);
  if (!(await consumeAiCalls(day, calls))) {
    return { ok: false, status: 429, error: "오늘 AI 호출 한도를 모두 사용했습니다." };
  }
  const out = await runDebate(sector, stats, news, nvidiaChat, day);
  if (!out.ok) {
    await consumeAiCalls(day, -calls).catch(() => undefined); // 중단하면 호출 횟수를 돌려준다
    return { ok: false, status: 502, error: out.error };
  }
  const debate: Debate = {
    sector,
    day,
    createdAt: new Date().toISOString(),
    model: nvidiaModel(),
    stats,
    news: news.map((n) => ({ title: n.title, source: n.source, link: n.link })),
    ...out.run,
  };
  await saveDebate(debate);
  return { ok: true, debate, cached: false };
}
