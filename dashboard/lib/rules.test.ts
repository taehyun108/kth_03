import { describe, expect, it } from "vitest";
import type { Fundamentals, Metric, YearPoint } from "./fundamentals";
import { evaluateRules, verdictOf } from "./rules";

const m = (key: string, value: number | null, note?: string): Metric => ({ key, label: key, value, display: String(value), formula: "", note });
const y = (year: string, ni: number | null, roe: number | null): YearPoint => ({ year, revenue: 1, operatingIncome: 1, netIncome: ni, operatingCashFlow: 1, roe });

function fx(over: Partial<Fundamentals> = {}, metrics: Metric[] = []): Fundamentals {
  return {
    symbol: "X", name: "X", currency: "KRW", price: 1, marketCap: 1000, fiscalDate: "2025-12-31",
    metrics, history: [y("2023", 100, 20), y("2024", 100, 20), y("2025", 100, 20)], ...over,
  };
}
const card = (f: Fundamentals, key: string) => evaluateRules(f).find((c) => c.key === key)!;

describe("verdictOf", () => {
  it("경계값", () => {
    expect(verdictOf(4, 5)).toBe("충족");
    expect(verdictOf(3, 5)).toBe("일부 충족");
    expect(verdictOf(2, 5)).toBe("미흡");
    expect(verdictOf(2, 2)).toBe("판단불가");
  });
});

describe("evaluateRules", () => {
  it("그레이엄: 3년 평균 PER 10, PBR 1 → 책 기준 통과", () => {
    const c = card(fx({}, [m("pbr", 1), m("debtRatio", 50)]), "benjamin_graham");
    expect(c.criteria.filter((k) => k.fromBook).every((k) => k.ok)).toBe(true);
    expect(c.verdict).toBe("충족");
  });
  it("그레이엄: 적자 이력이 있으면 이익 꾸준함 미달", () => {
    const f = fx({ history: [y("2024", -5, 1), y("2025", 100, 10)] }, [m("pbr", 1)]);
    expect(card(f, "benjamin_graham").criteria[0].ok).toBe(false);
  });
  it("금융업은 부채비율을 판단하지 않는다", () => {
    const f = fx({}, [m("debtRatio", 900, "금융업")]);
    const d = card(f, "warren_buffett").criteria.find((k) => k.label.includes("빚"))!;
    expect(d.ok).toBeNull();
  });
  it("지표가 거의 없으면 판단불가", () => {
    const f = fx({ marketCap: null, history: [] }, []);
    expect(card(f, "peter_lynch").verdict).toBe("판단불가");
  });
  it("린치: 이익이 줄면 PEG 미달", () => {
    const f = fx({}, [m("per", 10), m("niGrowth", -5)]);
    expect(card(f, "peter_lynch").criteria[0].ok).toBe(false);
  });
  it("린치: PER 10, 성장 20% → PEG 0.5 통과", () => {
    const f = fx({}, [m("per", 10), m("niGrowth", 20)]);
    expect(card(f, "peter_lynch").criteria[0].ok).toBe(true);
  });
});
