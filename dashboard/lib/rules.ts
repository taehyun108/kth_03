import type { Fundamentals } from "./fundamentals";
import { INVESTORS } from "./investors.generated";

/**
 * 정량 기준 점검표 — AI 없이, 계산된 지표만으로 투자자별 숫자 기준을 하나씩 확인한다.
 * AI 판단이 실패하거나 한도에 걸려도 항상 보여 줄 수 있고, 같은 입력이면 항상 같은 결과다.
 *
 * 출처에 대한 정직한 표시:
 *  - fromBook=true 인 기준(그레이엄의 PER 15배·PBR 1.5배·PER×PBR 22.5)은 『The Intelligent Investor』 제14장의
 *    '방어적 투자자의 종목 선정 기준'에서 가져왔다 (원문 대조 완료). 이익은 3년 평균, 적자 여부는 데이터가 있는 최근 연도만 본다.
 *  - 나머지 숫자는 이 앱의 '참고용 기본값'이며 투자자 본인의 규칙이 아니다. 아래 TH 에서 조정한다.
 *  - 해자·경영진 같은 정성 판단은 계산으로 할 수 없어 포함하지 않는다.
 */
export const TH = {
  graham: { per3: 15, pbr: 1.5, perTimesPbr: 22.5, debtRatio: 100 },
  buffett: { roe: 15, opMargin: 10, debtRatio: 100, per: 25 },
  munger: { roeEachYear: 10, debtRatio: 100, ocfOverNi: 0.8, opGrowthFloor: -20 },
  lynch: { peg: 1, niGrowth: 10 },
};

export type Criterion = { label: string; rule: string; ok: boolean | null; value: string; fromBook?: boolean };
export type RuleVerdict = "충족" | "일부 충족" | "미흡" | "판단불가";
export type RuleCard = { key: string; name: string; icon: string; criteria: Criterion[]; passed: number; total: number; verdict: RuleVerdict };

const metric = (f: Fundamentals, key: string): number | null => f.metrics.find((m) => m.key === key)?.value ?? null;
const isFinancial = (f: Fundamentals): boolean => f.metrics.find((m) => m.key === "debtRatio")?.note !== undefined;
const x = (v: number | null, d = 1): string => (v === null ? "–" : `${v.toFixed(d)}배`);
const p = (v: number | null, d = 1): string => (v === null ? "–" : `${v.toFixed(d)}%`);
const NA = "데이터 없음";

const years = (f: Fundamentals) => f.history.filter((h) => h.netIncome !== null);

/** 데이터가 있는 최근 연도 모두 흑자인가 */
function profitable(f: Fundamentals, fromBook = false): Criterion {
  const ys = years(f);
  const rule = fromBook ? "데이터가 있는 최근 연도 모두 흑자 (책: 최근 10년간 적자 없음)" : "데이터가 있는 최근 연도 모두 흑자";
  if (ys.length === 0) return { label: "이익의 꾸준함", rule, ok: null, value: NA, fromBook };
  const good = ys.filter((y) => (y.netIncome as number) > 0).length;
  return { label: "이익의 꾸준함", rule, ok: good === ys.length, value: `${ys.length}년 중 ${good}년 흑자`, fromBook };
}

/** 부채비율. 금융업은 예금·보험이 부채에 잡혀 비교가 안 되므로 판단하지 않는다. */
function debt(f: Fundamentals, max: number, label = "재무 건전성(부채비율)"): Criterion {
  const rule = `부채비율 ${max}% 이하`;
  if (isFinancial(f)) return { label, rule, ok: null, value: "금융업은 비교하지 않음" };
  const v = metric(f, "debtRatio");
  return { label, rule, ok: v === null ? null : v <= max, value: v === null ? NA : p(v, 0) };
}

/** 최근 3개 연도(있는 만큼) 평균 이익 대비 PER — 그레이엄 방식 */
function per3(f: Fundamentals): { per: number | null; n: number } {
  const ys = years(f).slice(-3);
  if (ys.length === 0 || f.marketCap === null) return { per: null, n: ys.length };
  const avg = ys.reduce((s, y) => s + (y.netIncome as number), 0) / ys.length;
  return { per: avg > 0 ? f.marketCap / avg : null, n: ys.length };
}

function grahamCriteria(f: Fundamentals): Criterion[] {
  const t = TH.graham;
  const { per, n } = per3(f);
  const pbr = metric(f, "pbr");
  const avgNote = n > 0 && n < 3 ? ` (이익 ${n}년 평균)` : "";
  const prod = per !== null && pbr !== null ? per * pbr : null;
  return [
    profitable(f, true),
    { label: "적당한 PER", rule: `PER ${t.per3}배 이하 (3년 평균 이익 기준, 책 제14장)`, ok: per === null ? null : per <= t.per3, value: per === null ? NA : `${x(per)}${avgNote}`, fromBook: true },
    { label: "적당한 PBR", rule: `PBR ${t.pbr}배 이하 (책 제14장)`, ok: pbr === null ? null : pbr <= t.pbr, value: x(pbr), fromBook: true },
    { label: "PER × PBR", rule: `${t.perTimesPbr} 이하 (책의 경험칙)`, ok: prod === null ? null : prod <= t.perTimesPbr, value: prod === null ? NA : prod.toFixed(1), fromBook: true },
    debt(f, t.debtRatio, "재무 건전성(부채비율, 근사)"),
  ];
}

function buffettCriteria(f: Fundamentals): Criterion[] {
  const t = TH.buffett;
  const roe = metric(f, "roe");
  const opm = metric(f, "opMargin");
  const fcf = metric(f, "fcf");
  const per = metric(f, "per");
  return [
    { label: "높은 자기자본이익률(ROE)", rule: `ROE ${t.roe}% 이상`, ok: roe === null ? null : roe >= t.roe, value: p(roe) },
    { label: "이익률(가격 결정력)", rule: `영업이익률 ${t.opMargin}% 이상`, ok: opm === null ? null : opm >= t.opMargin, value: opm === null ? NA : p(opm) },
    profitable(f),
    { label: "현금 창출", rule: "잉여현금흐름이 플러스", ok: fcf === null ? null : fcf > 0, value: fcf === null ? NA : fcf > 0 ? "플러스" : "마이너스" },
    debt(f, t.debtRatio, "적은 빚(부채비율)"),
    { label: "적당한 가격", rule: `PER ${t.per}배 이하`, ok: per === null ? null : per <= t.per, value: x(per) },
  ];
}

function mungerCriteria(f: Fundamentals): Criterion[] {
  const t = TH.munger;
  const rs = f.history.map((h) => h.roe).filter((v): v is number => v !== null);
  const ocf = metric(f, "ocf");
  const ni = years(f).at(-1)?.netIncome ?? null;
  const opg = metric(f, "opGrowth");
  const ocfOk = ocf === null ? null : ocf > 0 && (ni === null || ni <= 0 || ocf >= ni * t.ocfOverNi);
  return [
    {
      label: "해마다 높은 자본 수익", rule: `데이터가 있는 모든 해 ROE ${t.roeEachYear}% 이상`,
      ok: rs.length === 0 ? null : rs.every((v) => v >= t.roeEachYear), value: rs.length === 0 ? NA : `${rs.length}년 중 최저 ${p(Math.min(...rs))}`,
    },
    debt(f, t.debtRatio, "망할 이유 점검: 빚(부채비율)"),
    {
      label: "이익의 질(현금흐름)", rule: `영업현금흐름이 플러스이고 순이익의 ${Math.round(t.ocfOverNi * 100)}% 이상`,
      ok: ocfOk, value: ocf === null ? NA : ni !== null && ni > 0 ? `순이익의 ${Math.round((ocf / ni) * 100)}%` : ocf > 0 ? "플러스" : "마이너스",
    },
    { ...profitable(f), label: "망할 이유 점검: 적자 이력" },
    {
      label: "망할 이유 점검: 급격한 악화", rule: `영업이익 증가율 ${t.opGrowthFloor}% 초과`,
      ok: opg === null ? null : opg > t.opGrowthFloor, value: opg === null ? NA : p(opg),
    },
  ];
}

function lynchCriteria(f: Fundamentals): Criterion[] {
  const t = TH.lynch;
  const per = metric(f, "per");
  const g = metric(f, "niGrowth");
  const rev = metric(f, "revenueGrowth");
  const ocf = metric(f, "ocf");
  let pegOk: boolean | null = null;
  let pegValue = NA;
  if (per !== null && g !== null) {
    if (g <= 0) {
      pegOk = false;
      pegValue = `이익 성장 없음(${p(g)})`;
    } else {
      pegOk = per / g <= t.peg;
      pegValue = `PEG ${(per / g).toFixed(2)}`;
    }
  }
  return [
    { label: "성장 대비 가격(PEG)", rule: `PEG(PER ÷ 순이익 증가율) ${t.peg} 이하`, ok: pegOk, value: pegValue },
    { label: "성장세", rule: `순이익 증가율 ${t.niGrowth}% 이상`, ok: g === null ? null : g >= t.niGrowth, value: p(g) },
    { label: "실속 있는 성장(매출)", rule: "매출도 늘었는지(증가율 0% 초과)", ok: rev === null ? null : rev > 0, value: p(rev) },
    { label: "현금 창출", rule: "영업현금흐름이 플러스", ok: ocf === null ? null : ocf > 0, value: ocf === null ? NA : ocf > 0 ? "플러스" : "마이너스" },
    debt(f, TH.buffett.debtRatio, "재무 건전성(부채비율)"),
  ];
}

const SETS: Record<string, (f: Fundamentals) => Criterion[]> = {
  warren_buffett: buffettCriteria,
  charlie_munger: mungerCriteria,
  benjamin_graham: grahamCriteria,
  peter_lynch: lynchCriteria,
};

export function verdictOf(passed: number, total: number): RuleVerdict {
  if (total < 3) return "판단불가"; // 확인할 수 있는 기준이 너무 적다
  const r = passed / total;
  return r >= 0.8 ? "충족" : r >= 0.5 ? "일부 충족" : "미흡";
}

/** 투자자별 점검표. 점검 기준이 정해지지 않은 투자자(예: 새로 추가한 투자자)는 건너뛴다. */
export function evaluateRules(f: Fundamentals): RuleCard[] {
  return INVESTORS.filter((inv) => SETS[inv.key]).map((inv) => {
    const criteria = SETS[inv.key](f);
    const evaluated = criteria.filter((c) => c.ok !== null);
    const passed = evaluated.filter((c) => c.ok).length;
    return { key: inv.key, name: inv.name, icon: inv.icon, criteria, passed, total: evaluated.length, verdict: verdictOf(passed, evaluated.length) };
  });
}
