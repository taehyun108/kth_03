import { fmtInt, fmtKRW } from "./format";

/** 야후 연간 재무제표 한 해치(필요한 항목만). 값이 없으면 undefined. */
export type StatementRow = {
  date: Date | string;
  totalRevenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  netIncomeCommonStockholders?: number;
  stockholdersEquity?: number;
  commonStockEquity?: number;
  totalEquityGrossMinorityInterest?: number;
  totalLiabilitiesNetMinorityInterest?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
  dilutedEPS?: number;
  basicEPS?: number;
};

export type QuoteLite = {
  symbol: string;
  name: string;
  currency: string;
  price: number | null;
  marketCap: number | null;
};

export type Metric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  /** 계산식과 실제 넣은 값. 값이 없으면 왜 없는지. */
  formula: string;
  /** 해석할 때 주의할 점 (예: 금융업 부채비율). AI 판단에도 함께 전달된다. */
  note?: string;
};

export type YearPoint = {
  year: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  roe: number | null;
};

export type Fundamentals = {
  symbol: string;
  name: string;
  currency: string;
  price: number | null;
  marketCap: number | null;
  /** 가장 최근 결산일 (YYYY-MM-DD) */
  fiscalDate: string;
  metrics: Metric[];
  history: YearPoint[];
};

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const money = (v: number | null): string => (v === null ? "–" : fmtKRW(v));
const pct = (v: number | null, digits = 1): string => (v === null ? "–" : `${v.toFixed(digits)}%`);
const times = (v: number | null): string => (v === null ? "–" : `${v.toFixed(1)}배`);
const dateStr = (d: Date | string): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

function ratio(a: number | null, b: number | null): number | null {
  return a === null || b === null || b === 0 ? null : a / b;
}
function growthFormula(label: string, cur: number | null, prev: number | null): string {
  if (cur === null || prev === null) return `${label} 값이 없어 계산하지 않음`;
  if (prev <= 0) return `전년 ${label}이 0 이하라 증가율을 계산하지 않음`;
  return `(올해 ${label} ÷ 전년 ${label} − 1) × 100 = (${money(cur)} ÷ ${money(prev)} − 1) × 100`;
}
function growth(cur: number | null, prev: number | null): number | null {
  // 이전 값이 0 이하이면 증가율이 의미 없다 (적자→흑자 등)
  return cur === null || prev === null || prev <= 0 ? null : (cur / prev - 1) * 100;
}

const hasData = (r: StatementRow): boolean =>
  [r.totalRevenue, r.operatingIncome, r.netIncome, r.netIncomeCommonStockholders, r.commonStockEquity, r.stockholdersEquity].some((v) => n(v) !== null);

const FINANCIAL_NOTE = "금융업은 예금·보험 등이 부채에 포함돼 수치가 매우 크며 일반 기업과 비교할 수 없음";

export function computeFundamentals(quote: QuoteLite, rawRows: StatementRow[], opts: { sector?: string | null } = {}): Fundamentals {
  const sorted = [...rawRows].sort((a, b) => dateStr(a.date).localeCompare(dateStr(b.date)));
  // 야후가 값이 하나도 없는 빈 연도를 줄 때가 있어 뺀다 (전부 비면 마지막 행만 남겨 '–' 로 보여 준다)
  const withData = sorted.filter(hasData);
  const rows = (withData.length > 0 ? withData : sorted.slice(-1)).slice(-5); // 최근 5개년
  const last = rows.at(-1);
  const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined;
  if (!last) throw new Error("재무제표 데이터가 없습니다");

  const price = quote.price;
  const cap = quote.marketCap;
  const revenue = n(last.totalRevenue);
  const op = n(last.operatingIncome);
  const ni = n(last.netIncomeCommonStockholders) ?? n(last.netIncome);
  const niPrev = prev ? (n(prev.netIncomeCommonStockholders) ?? n(prev.netIncome)) : null;
  const equity = n(last.commonStockEquity) ?? n(last.stockholdersEquity);
  const equityPrev = prev ? (n(prev.commonStockEquity) ?? n(prev.stockholdersEquity)) : null;
  const avgEquity = equity !== null && equityPrev !== null ? (equity + equityPrev) / 2 : equity;
  const totalEquity = n(last.totalEquityGrossMinorityInterest) ?? n(last.stockholdersEquity) ?? equity;
  const liabilities = n(last.totalLiabilitiesNetMinorityInterest);
  const ocf = n(last.operatingCashFlow);
  const capex = n(last.capitalExpenditure);
  const fcf = n(last.freeCashFlow) ?? (ocf !== null && capex !== null ? ocf + capex : null);
  const eps = n(last.dilutedEPS) ?? n(last.basicEPS);

  const per = ni !== null && ni > 0 ? ratio(cap, ni) : null;
  const pbr = equity !== null && equity > 0 ? ratio(cap, equity) : null;
  const roeV = ratio(ni, avgEquity !== null && avgEquity > 0 ? avgEquity : null);
  const roe = roeV === null ? null : roeV * 100;
  const debtRatio = totalEquity !== null && totalEquity > 0 ? ratio(liabilities, totalEquity) : null;
  const opMargin = ratio(op, revenue);
  const netMargin = ratio(ni, revenue);

  const isFinancial = opts.sector === "금융" || (debtRatio !== null && debtRatio * 100 > 600);

  const metrics: Metric[] = [
    {
      key: "marketCap", label: "시가총액", value: cap, display: money(cap),
      formula: "야후가 제공하는 시가총액 (우선주 포함 여부는 종목마다 다름)",
    },
    {
      key: "per", label: "PER", value: per, display: times(per),
      formula: per === null
        ? "순이익이 0 이하이거나 값이 없어 계산하지 않음"
        : `시가총액 ÷ 지배주주 순이익 = ${money(cap)} ÷ ${money(ni)}`,
    },
    {
      key: "pbr", label: "PBR", value: pbr, display: times(pbr),
      formula: pbr === null ? "자본이 0 이하이거나 값이 없어 계산하지 않음" : `시가총액 ÷ 자본(지배주주) = ${money(cap)} ÷ ${money(equity)}`,
    },
    {
      key: "roe", label: "ROE", value: roe, display: pct(roe),
      formula: roe === null
        ? "자본 또는 순이익 값이 없어 계산하지 않음"
        : `순이익 ÷ 평균 자본 × 100 = ${money(ni)} ÷ ${money(avgEquity)} × 100` + (equityPrev === null ? " (전년 자본이 없어 기말 자본 사용)" : " (기초·기말 평균)"),
    },
    {
      key: "debtRatio", label: "부채비율", note: isFinancial ? FINANCIAL_NOTE : undefined, value: debtRatio === null ? null : debtRatio * 100, display: pct(debtRatio === null ? null : debtRatio * 100, 0),
      formula: debtRatio === null ? "부채 또는 자본 값이 없어 계산하지 않음" : `부채총계 ÷ 자본총계 × 100 = ${money(liabilities)} ÷ ${money(totalEquity)} × 100` + (isFinancial ? ` — ${FINANCIAL_NOTE}` : ""),
    },
    {
      key: "opMargin", label: "영업이익률", value: opMargin === null ? null : opMargin * 100, display: pct(opMargin === null ? null : opMargin * 100),
      formula: opMargin === null ? "영업이익 또는 매출 값이 없어 계산하지 않음" : `영업이익 ÷ 매출 × 100 = ${money(op)} ÷ ${money(revenue)} × 100`,
    },
    {
      key: "netMargin", label: "순이익률", value: netMargin === null ? null : netMargin * 100, display: pct(netMargin === null ? null : netMargin * 100),
      formula: netMargin === null ? "순이익 또는 매출 값이 없어 계산하지 않음" : `순이익 ÷ 매출 × 100 = ${money(ni)} ÷ ${money(revenue)} × 100`,
    },
    {
      key: "revenueGrowth", label: "매출 증가율", value: growth(revenue, prev ? n(prev.totalRevenue) : null), display: pct(growth(revenue, prev ? n(prev.totalRevenue) : null)),
      formula: growthFormula("매출", revenue, prev ? n(prev.totalRevenue) : null),
    },
    {
      key: "opGrowth", label: "영업이익 증가율", value: growth(op, prev ? n(prev.operatingIncome) : null), display: pct(growth(op, prev ? n(prev.operatingIncome) : null)),
      formula: growthFormula("영업이익", op, prev ? n(prev.operatingIncome) : null),
    },
    {
      key: "niGrowth", label: "순이익 증가율", value: growth(ni, niPrev), display: pct(growth(ni, niPrev)),
      formula: growthFormula("순이익", ni, niPrev),
    },
    {
      key: "eps", label: "EPS", value: eps, display: eps === null ? "–" : `${fmtInt(eps)}원`,
      formula: "회사가 보고한 희석 주당순이익 (없으면 기본 주당순이익)",
    },
    {
      key: "ocf", label: "영업현금흐름", value: ocf, display: money(ocf),
      formula: "회사가 보고한 영업활동 현금흐름",
    },
    {
      key: "fcf", label: "잉여현금흐름", value: fcf, display: money(fcf),
      formula: last.freeCashFlow !== undefined && n(last.freeCashFlow) !== null
        ? "회사가 보고한 잉여현금흐름 (영업현금흐름 − 설비투자)"
        : `영업현금흐름 + 설비투자(음수) = ${money(ocf)} + ${money(capex)}`,
    },
  ];

  const history: YearPoint[] = rows.map((r) => {
    const rNi = n(r.netIncomeCommonStockholders) ?? n(r.netIncome);
    const rEq = n(r.commonStockEquity) ?? n(r.stockholdersEquity);
    const roeYear = rNi !== null && rEq !== null && rEq > 0 ? (rNi / rEq) * 100 : null;
    return {
      year: dateStr(r.date).slice(0, 4),
      revenue: n(r.totalRevenue),
      operatingIncome: n(r.operatingIncome),
      netIncome: rNi,
      operatingCashFlow: n(r.operatingCashFlow),
      roe: roeYear,
    };
  });

  return {
    symbol: quote.symbol,
    name: quote.name,
    currency: quote.currency,
    price,
    marketCap: cap,
    fiscalDate: dateStr(last.date),
    metrics,
    history,
  };
}

/** AI 판단에 넘길 확정 수치. 화면에 보이는 값과 같은 문자열을 쓴다. */
export function factsForJudge(f: Fundamentals): Record<string, string> {
  const byKey = new Map(f.metrics.map((m) => [m.key, m]));
  const out: Record<string, string> = {};
  if (f.price !== null) out["현재가"] = `${fmtInt(f.price)}원`;
  const pick: [string, string][] = [
    ["marketCap", "시가총액"], ["per", "PER"], ["pbr", "PBR"], ["roe", "ROE"], ["debtRatio", "부채비율"],
    ["opMargin", "영업이익률"], ["netMargin", "순이익률"], ["revenueGrowth", "매출 증가율(전년 대비)"],
    ["opGrowth", "영업이익 증가율(전년 대비)"], ["niGrowth", "순이익 증가율(전년 대비)"],
    ["ocf", "영업현금흐름"], ["fcf", "잉여현금흐름"], ["eps", "EPS"],
  ];
  for (const [key, label] of pick) {
    const m = byKey.get(key);
    if (m && m.display !== "–") out[label] = m.note ? `${m.display} (${m.note})` : m.display;
  }
  out["기준 결산일"] = f.fiscalDate;
  const trend = f.history
    .filter((h) => h.netIncome !== null)
    .map((h) => `${h.year}년 ${money(h.netIncome)}`)
    .join(", ");
  if (trend) out["연도별 순이익"] = trend;
  return out;
}
