import YahooFinance from "yahoo-finance2";
import { computeFundamentals, type Fundamentals, type QuoteLite, type StatementRow } from "./fundamentals";
import { UNIVERSE } from "./universe";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** 6자리 코드 -> 야후 심볼. 목록에 있으면 그 시장, 없으면 .KS 다음 .KQ 를 시험한다. */
export async function resolveSymbol(code: string): Promise<{ symbol: string; quote: QuoteLite } | null> {
  const known = UNIVERSE.find((u) => u.code === code);
  const candidates = known ? [known.symbol] : [`${code}.KS`, `${code}.KQ`];
  for (const symbol of candidates) {
    try {
      const q = (await yf.quote(symbol)) as Record<string, unknown>;
      const price = typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
      if (price === null) continue;
      return {
        symbol,
        quote: {
          symbol,
          name: String(q.shortName ?? q.longName ?? symbol),
          currency: String(q.currency ?? "KRW"),
          price,
          marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
        },
      };
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** 시세 + 최근 5개년 연간 재무제표 -> 지표. 서버에서만 호출한다. */
export async function loadFundamentals(code: string): Promise<Fundamentals> {
  const resolved = await resolveSymbol(code);
  if (!resolved) throw new Error("야후에서 종목을 찾지 못했습니다");
  const period1 = `${new Date().getFullYear() - 6}-01-01`;
  const rows = (await yf.fundamentalsTimeSeries(resolved.symbol, {
    period1,
    type: "annual",
    module: "all",
  })) as unknown as StatementRow[];
  const known = UNIVERSE.find((u) => u.code === code);
  const f = computeFundamentals(resolved.quote, rows, { sector: known?.sector });
  return known ? { ...f, name: known.name } : f;
}
