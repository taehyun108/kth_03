import type { Stock } from "./types";

/** 화면에 보여 줄 산업 순서. 목록에 없는 산업은 뒤에 붙는다. */
export const SECTOR_ORDER = [
  "반도체",
  "이차전지",
  "바이오·제약",
  "금융",
  "자동차",
  "조선·방산·기계",
  "철강·화학·소재",
  "인터넷·게임·엔터",
  "에너지·전력",
  "소비·통신",
] as const;

export function sectorsOf(stocks: Stock[]): string[] {
  const present = new Set(stocks.map((s) => s.sector));
  const known = SECTOR_ORDER.filter((s) => present.has(s));
  const extra = [...present].filter((s) => !(SECTOR_ORDER as readonly string[]).includes(s)).sort();
  return [...known, ...extra];
}

/** 거래량 순위. 같으면 거래대금, 그다음 코드 순으로 정해 매번 같은 순서가 나오게 한다. */
export function topByVolume(stocks: Stock[], sector?: string | null, limit = 20): Stock[] {
  return stocks
    .filter((s) => !sector || s.sector === sector)
    .sort((a, b) => b.volume - a.volume || b.tradingValue - a.tradingValue || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export type SectorTotal = {
  sector: string;
  count: number;
  tradingValue: number;
  /** 산업 내 거래대금 1위 종목 */
  leader: string;
  /** 거래대금 가중 평균 등락률 */
  avgChangePct: number;
};

/** 산업별 거래대금 합계와 순위(거래대금 큰 순). */
export function sectorTotals(stocks: Stock[]): SectorTotal[] {
  const groups = new Map<string, Stock[]>();
  for (const s of stocks) groups.set(s.sector, [...(groups.get(s.sector) ?? []), s]);
  return [...groups.entries()]
    .map(([sector, list]) => {
      const tradingValue = list.reduce((sum, s) => sum + s.tradingValue, 0);
      const weighted = list.reduce((sum, s) => sum + (s.changePct ?? 0) * s.tradingValue, 0);
      const leader = [...list].sort((a, b) => b.tradingValue - a.tradingValue)[0]?.name ?? "";
      return {
        sector,
        count: list.length,
        tradingValue,
        leader,
        avgChangePct: tradingValue > 0 ? weighted / tradingValue : 0,
      };
    })
    .sort((a, b) => b.tradingValue - a.tradingValue);
}
