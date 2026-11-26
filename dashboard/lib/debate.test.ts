import { describe, expect, it, vi } from "vitest";
import {
  buildRound1Prompt, buildRound2Prompt, callsPerDebate, criteriaOf, parseRebuttal, parseView, personaOf, runDebate, tally,
  type SectorStats, type View,
} from "./debate";
import { sectorStats } from "./debatePipeline";
import { isSpamNews } from "./news";
import { SECTOR_ORDER } from "./rank";
import { SECTOR_QUERIES, sectorQueries } from "./sectors";
import { INVESTORS } from "./investors.generated";
import { MAX_PROMPT_CHARS } from "./judge";
import { getDebate, latestDebates, saveDebate } from "./store";
import type { Stock } from "./types";

const STATS: SectorStats = { tradingValue: 5e12, sharePct: 21.3, avgChangePct: 1.25, leader: "삼성전자", top: ["삼성전자(+0.35%)", "SK하이닉스(+2.23%)"] };
const NEWS = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `반도체 업황 기사 제목 ${i} `.repeat(4), source: "매체", link: `https://x/${i}`, publishedAt: "2026-11-25T00:00:00Z" }));
const inv = INVESTORS[0];
const v = (investor: string, stance: View["stance"], confidence: number | null = 60): View => ({ investor, icon: "x", stance, confidence, reasons: ["근거 하나", "근거 둘"] });

describe("프롬프트", () => {
  it("투자자 설정 첫 줄과 기준 줄을 쓰고 종목용 출력 형식 줄은 뺀다", () => {
    expect(personaOf(inv)).toContain("워런 버핏");
    const c = criteriaOf(inv);
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.some((l) => /사자|팔자|중립|확신도/.test(l))).toBe(false);
    for (const i of INVESTORS) expect(criteriaOf(i).length).toBeGreaterThan(0);
  });
  it("1라운드: 산업·거래 현황·뉴스·형식 규칙, 3천 자 이내", () => {
    const p = buildRound1Prompt(inv, "반도체", STATS, NEWS(40), "2026-11-26");
    expect(p).toContain("'반도체' 산업 전체");
    expect(p).toContain("[토론 1라운드]");
    expect(p).toContain("거래대금 1위 종목: 삼성전자");
    expect(p).toContain("\n[최근 뉴스 제목]\n- ");
    expect(p).toContain("판정: 성장 / 보합 / 침체 중 하나");
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });
  it("2라운드: 내 의견과 다른 사람 의견을 넣고, 내 의견은 '다른 투자자'에 넣지 않는다", () => {
    const mine = v("워런 버핏", "성장", 70);
    const others = [v("찰리 멍거", "침체", 55), v("피터 린치", "보합", 40)];
    const p = buildRound2Prompt(inv, "반도체", STATS, mine, others, NEWS(30), "2026-11-26");
    const [, otherPart] = p.split("[다른 투자자의 1라운드 의견]");
    expect(p).toContain("[토론 2라운드]");
    expect(otherPart).toContain("찰리 멍거: 침체(확신 55)");
    expect(otherPart).toContain("피터 린치: 보합(확신 40)");
    expect(otherPart.split("[오늘 거래 현황]")[0]).not.toContain("워런 버핏");
    expect(p).toContain("입장: 유지 또는 변경");
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });
});

describe("답변 해석", () => {
  it("1라운드: 판정·확신도·이유, 마크다운과 마지막 판정 우선", () => {
    const r = parseView(inv, "**판정:** 성장 (처음)\n...\n판정: 침체\n**확신도:** 130\n이유:\n1. 가\n2. 나\n- 다");
    expect(r).toMatchObject({ stance: "침체", confidence: 100, reasons: ["가", "나", "다"] });
    expect(parseView(inv, "모르겠어요")).toMatchObject({ stance: null, error: "판정을 읽지 못함" });
  });
  it("2라운드: 입장·반박(여러 줄)·최종 이유", () => {
    const r = parseRebuttal(inv, "판정: 보합\n확신도: 45\n입장: 변경\n반박: 멍거의 지적은 타당하지만\n수요 둔화는 일시적이다.\n이유: 재고 조정 마무리 단계");
    expect(r).toMatchObject({ stance: "보합", confidence: 45, changed: true, rebuttal: "멍거의 지적은 타당하지만 수요 둔화는 일시적이다.", reasons: ["재고 조정 마무리 단계"] });
  });
  it("입장 줄이 없으면 changed 는 null", () => {
    expect(parseRebuttal(inv, "판정: 성장\n확신도: 80\n반박: ㅇ\n이유: ㅇ").changed).toBeNull();
    expect(parseRebuttal(inv, "횡설수설").stance).toBeNull();
  });
});

describe("tally", () => {
  it("다수결", () => {
    expect(tally([v("a", "성장"), v("b", "성장"), v("c", "침체")]).label).toBe("성장");
  });
  it("동수면 확신도 합이 큰 쪽", () => {
    expect(tally([v("a", "성장", 90), v("b", "침체", 60), v("c", "성장", 30), v("d", "침체", 70)]).label).toBe("침체"); // 성장 90+30=120, 침체 60+70=130
  });
  it("확신도까지 같으면 보합, 판정 없는 의견은 세지 않는다", () => {
    expect(tally([v("a", "성장", 50), v("b", "침체", 50)]).label).toBe("보합");
    const t = tally([v("a", "성장"), v("b", null)]);
    expect(t.votes).toEqual({ 성장: 1, 보합: 0, 침체: 0 });
  });
  it("확신도가 없으면 50 으로 본다", () => {
    expect(tally([v("a", "성장", null), v("b", "침체", 49)]).label).toBe("성장");
  });
});

describe("runDebate", () => {
  const good = (stance: string) => `판정: ${stance}\n확신도: 70\n이유:\n1. a\n2. b\n3. c`;
  const reb = (stance: string, changed: string) => `판정: ${stance}\n확신도: 65\n입장: ${changed}\n반박: 이름을 들어 반박\n이유: 최종 한 줄`;

  function llmFor(opts: { r1?: (name: string) => string; r2?: (name: string) => string; summary?: () => string } = {}) {
    return vi.fn(async (prompt: string) => {
      // 2라운드 프롬프트에는 다른 투자자 이름도 들어 있으므로 첫 줄의 "너는 ○○의 투자 원칙" 으로 누가 답하는지 정한다
      const name = INVESTORS.find((i) => prompt.includes(`너는 ${i.name}의`))?.name ?? "?";
      if (prompt.includes("투자 토론의 사회자")) return (opts.summary ?? (() => "요약: 반도체는 성장으로 모아졌고 쟁점은 사이클이다."))();
      if (prompt.includes("[토론 2라운드]")) return (opts.r2 ?? (() => reb("성장", "유지")))(name);
      return (opts.r1 ?? (() => good("성장")))(name);
    });
  }

  it("정상: 호출 수는 2N+1, 투표·결론·요약", async () => {
    const llm = llmFor({ r1: (n) => good(n === "찰리 멍거" ? "침체" : "성장"), r2: (n) => reb("성장", n === "찰리 멍거" ? "변경" : "유지") });
    const out = await runDebate("반도체", STATS, NEWS(5), llm, "2026-11-26");
    expect(llm).toHaveBeenCalledTimes(callsPerDebate(INVESTORS.length));
    if (!out.ok) throw new Error(out.error);
    expect(out.run.label).toBe("성장");
    expect(out.run.votes.성장).toBe(INVESTORS.length);
    expect(out.run.summary).toBe("반도체는 성장으로 모아졌고 쟁점은 사이클이다.");
    expect(out.run.round2.find((r) => r.investor === "찰리 멍거")).toMatchObject({ changed: true, rebuttal: "이름을 들어 반박" });
  });
  it("2라운드 프롬프트에는 다른 투자자의 1라운드 의견이 실제로 들어간다", async () => {
    const llm = llmFor({ r1: (n) => good(n === "찰리 멍거" ? "침체" : "성장") });
    await runDebate("반도체", STATS, [], llm, "2026-11-26");
    const r2 = llm.mock.calls.map((c) => c[0]).filter((p) => p.includes("[토론 2라운드]") && p.includes("워런 버핏의 투자 원칙"));
    expect(r2).toHaveLength(1);
    expect(r2[0]).toContain("찰리 멍거: 침체");
  });
  it("판정이 바뀌었는데 입장 줄이 없으면 판정 비교로 changed 를 정한다", async () => {
    const llm = llmFor({ r1: () => good("성장"), r2: () => "판정: 침체\n확신도: 60\n반박: ㅇ\n이유: ㅇ" });
    const out = await runDebate("반도체", STATS, [], llm, "2026-11-26");
    if (!out.ok) throw new Error(out.error);
    expect(out.run.round2.every((r) => r.changed === true)).toBe(true);
    expect(out.run.label).toBe("침체");
  });
  it("1라운드를 절반 미만만 받으면 중단하고 2라운드는 부르지 않는다", async () => {
    const llm = llmFor({ r1: (n) => { if (n !== "워런 버핏") throw new Error("quota"); return good("성장"); } });
    const out = await runDebate("반도체", STATS, [], llm, "2026-11-26");
    expect(out.ok).toBe(false);
    expect(llm).toHaveBeenCalledTimes(INVESTORS.length);
    expect(!out.ok && out.error).toContain("1라운드");
  });
  it("2라운드 답을 못 받으면 1라운드 판정을 가져오고, 요약이 실패하면 투표 문구로 대신한다", async () => {
    const llm = llmFor({ r2: () => "형식을 못 지킨 답", summary: () => { throw new Error("down"); } });
    const out = await runDebate("반도체", STATS, [], llm, "2026-11-26");
    if (!out.ok) throw new Error(out.error);
    expect(out.run.round2.every((r) => r.carried === true && r.stance === "성장")).toBe(true);
    expect(out.run.summary).toContain("요약 생성에 실패");
    expect(out.run.label).toBe("성장");
  });
  it("사회자 답에 '요약:' 이 없으면 전체를 쓰고 500자로 자른다", async () => {
    const llm = llmFor({ summary: () => "가".repeat(900) });
    const out = await runDebate("반도체", STATS, [], llm, "2026-11-26");
    if (!out.ok) throw new Error(out.error);
    expect(out.run.summary).toHaveLength(500);
  });
});

describe("sectorStats", () => {
  const mk = (code: string, name: string, sector: string, volume: number, tv: number, ch: number): Stock => ({ code, name, market: "KOSPI", sector, price: 100, prevClose: 100, changePct: ch, volume, tradingValue: tv });
  const stocks = [mk("A", "에이", "반도체", 300, 600, 2), mk("B", "비", "반도체", 100, 200, -1), mk("C", "씨", "금융", 500, 200, 0)];
  it("거래대금 비중·가중 등락률·상위 종목", () => {
    const s = sectorStats("반도체", stocks)!;
    expect(s.tradingValue).toBe(800);
    expect(s.sharePct).toBeCloseTo(80, 6);
    expect(s.avgChangePct).toBeCloseTo((2 * 600 - 1 * 200) / 800, 6);
    expect(s.leader).toBe("에이");
    expect(s.top).toEqual(["에이(+2.00%)", "비(-1.00%)"]);
  });
  it("없는 산업은 null", () => {
    expect(sectorStats("없음", stocks)).toBeNull();
  });
});

describe("토론 저장(메모리)", () => {
  const d = (sector: string, day: string) => ({ sector, day, createdAt: `${day}T08:00:00Z`, model: "m", label: "성장" as const, votes: { 성장: 3, 보합: 1, 침체: 0 }, round1: [], round2: [], summary: "s", stats: STATS, news: [] });
  it("같은 산업·날짜는 덮어쓰고, 산업마다 가장 최근 것만 돌려준다", async () => {
    await saveDebate(d("테스트산업A", "2098-01-01"));
    await saveDebate(d("테스트산업A", "2098-01-03"));
    await saveDebate(d("테스트산업B", "2098-01-02"));
    expect((await getDebate("테스트산업A", "2098-01-01"))?.day).toBe("2098-01-01");
    expect(await getDebate("테스트산업A", "2098-01-09")).toBeNull();
    const latest = (await latestDebates()).filter((x) => x.sector.startsWith("테스트산업"));
    expect(latest.map((x) => `${x.sector}:${x.day}`).sort()).toEqual(["테스트산업A:2098-01-03", "테스트산업B:2098-01-02"]);
  });
});

describe("산업 뉴스 검색어와 스팸 필터", () => {
  it("모든 산업에 검색어가 있고 '산업 전망' 식 검색어는 쓰지 않는다", () => {
    for (const sector of SECTOR_ORDER) {
      expect(SECTOR_QUERIES[sector]?.length, sector).toBeGreaterThan(0);
      for (const q of sectorQueries(sector)) expect(q).not.toMatch(/산업 전망/);
    }
    expect(sectorQueries("처음보는산업")).toEqual(["처음보는산업주", "처음보는산업 업황"]);
  });
  it("시장조사 보고서 스팸을 걸러낸다", () => {
    expect(isSpamNews({ title: "위생 펌프 시장 2035년 전망: 바이오제약 무균 수요가 성장 견인", source: "IndexBox" })).toBe(true);
    expect(isSpamNews({ title: "충전 완료 공정용 칼럼 수요가 견인 - 뉴스 및 통계", source: "아무개" })).toBe(true);
    expect(isSpamNews({ title: "삼천당제약 시장 2030년 전망", source: "아무개" })).toBe(true);
    expect(isSpamNews({ title: "제약·바이오주 일제히 강세… 증권가 \"악재 반영\"", source: "머니투데이" })).toBe(false);
    expect(isSpamNews({ title: "코스피 2035년 전망치 상향", source: "한경" })).toBe(false);
  });
});
