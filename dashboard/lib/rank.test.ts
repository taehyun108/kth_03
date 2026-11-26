import { describe, expect, it } from "vitest";
import { fmtDate, fmtKRW, fmtPct, trend } from "./format";
import { sectorTotals, sectorsOf, topByVolume } from "./rank";
import type { Stock } from "./types";

const mk = (code: string, sector: string, volume: number, tradingValue: number, changePct: number | null): Stock => ({
  code, name: `종목${code}`, market: "KOSPI", sector, price: 100, prevClose: 100, changePct, volume, tradingValue,
});

const STOCKS = [
  mk("A", "반도체", 300, 9_000, 1),
  mk("B", "반도체", 100, 50_000, -2),
  mk("C", "금융", 200, 4_000, 0),
  mk("D", "새산업", 200, 4_000, null),
];

describe("topByVolume", () => {
  it("거래량 큰 순으로 정렬하고 같으면 거래대금, 코드 순", () => {
    expect(topByVolume(STOCKS).map((s) => s.code)).toEqual(["A", "C", "D", "B"]);
  });
  it("산업을 고르면 그 산업만, limit 을 지킨다", () => {
    expect(topByVolume(STOCKS, "반도체").map((s) => s.code)).toEqual(["A", "B"]);
    expect(topByVolume(STOCKS, null, 2)).toHaveLength(2);
  });
  it("원본 배열을 바꾸지 않는다", () => {
    const copy = [...STOCKS];
    topByVolume(STOCKS);
    expect(STOCKS).toEqual(copy);
  });
});

describe("sectorTotals / sectorsOf", () => {
  it("산업별 거래대금 합계 순으로 정렬하고 1위 종목을 돌려준다", () => {
    const t = sectorTotals(STOCKS);
    expect(t[0]).toMatchObject({ sector: "반도체", count: 2, tradingValue: 59_000, leader: "종목B" });
    expect(t.map((x) => x.sector)).toEqual(["반도체", "금융", "새산업"]);
  });
  it("평균 등락률은 거래대금 가중", () => {
    const semi = sectorTotals(STOCKS).find((x) => x.sector === "반도체")!;
    expect(semi.avgChangePct).toBeCloseTo((1 * 9_000 + -2 * 50_000) / 59_000, 6);
  });
  it("정해 둔 순서대로, 모르는 산업은 뒤에", () => {
    expect(sectorsOf(STOCKS)).toEqual(["반도체", "금융", "새산업"]);
  });
});

describe("format", () => {
  it("금액을 조·억·만으로", () => {
    expect(fmtKRW(2_446_278_771_000)).toBe("2.4조");
    expect(fmtKRW(94_402_816_200)).toBe("944억");
    expect(fmtKRW(15_000_000_000_000)).toBe("15.0조");
    expect(fmtKRW(5_000_000)).toBe("500만");
  });
  it("거래일을 한국식으로", () => {
    expect(fmtDate("2026-11-26")).toBe("2026년 11월 26일");
    expect(fmtDate("잘못된값")).toBe("잘못된값");
  });
  it("등락률 부호와 방향", () => {
    expect(fmtPct(2.2)).toBe("+2.20%");
    expect(fmtPct(-0.5)).toBe("-0.50%");
    expect(fmtPct(null)).toBe("–");
    expect([trend(1), trend(-1), trend(0), trend(null)]).toEqual(["up", "down", "flat", "flat"]);
  });
});
