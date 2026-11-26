import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { computeFundamentals, factsForJudge, type StatementRow } from "./fundamentals";
import { INVESTORS } from "./investors.generated";
import { buildPrompt, judgeStock, MAX_PROMPT_CHARS, parseOpinion } from "./judge";
import { parseNewsRss } from "./news";
import { nvidiaChat, nvidiaKeys, stripThinking } from "./nvidia";
import { consumeAiCalls, getJudgment, saveJudgment } from "./store";
import { lookup, type UniverseStock } from "./universe";

const U: UniverseStock[] = [
  { code: "005930", symbol: "005930.KS", name: "삼성전자", market: "KOSPI", sector: "반도체" },
  { code: "006400", symbol: "006400.KS", name: "삼성SDI", market: "KOSPI", sector: "이차전지" },
  { code: "000810", symbol: "000810.KS", name: "삼성화재", market: "KOSPI", sector: "금융" },
  { code: "035420", symbol: "035420.KS", name: "NAVER", market: "KOSPI", sector: "인터넷·게임·엔터" },
];

describe("투자자 프롬프트 동기화", () => {
  it("generated 파일이 ../investors/*.md 와 같다 (고쳤다면 npm run sync-investors)", async () => {
    // @ts-ignore — .mjs 스크립트
    const { buildGenerated } = await import("../scripts/sync-investors.mjs");
    expect(readFileSync(new URL("./investors.generated.ts", import.meta.url), "utf8")).toBe(buildGenerated());
  });
  it("모든 투자자에 [종목] 자리표시자와 이름이 있다", () => {
    expect(INVESTORS.length).toBeGreaterThanOrEqual(4);
    for (const i of INVESTORS) expect(i.template).toContain("[종목]");
    expect(INVESTORS.map((i) => i.name)).toContain("워런 버핏");
  });
});

describe("lookup", () => {
  it("6자리 코드: 목록 안은 found, 밖은 code", () => {
    expect(lookup("005930", U)).toMatchObject({ kind: "found" });
    expect(lookup(" 123456 ", U)).toEqual({ kind: "code", code: "123456" });
  });
  it("정확한 이름·공백·대소문자 무시", () => {
    expect(lookup("삼성 전자", U)).toMatchObject({ kind: "found", stock: { code: "005930" } });
    expect(lookup("naver", U)).toMatchObject({ kind: "found", stock: { code: "035420" } });
  });
  it("일부만 맞으면 후보 목록, 없으면 none", () => {
    expect(lookup("삼성", U)).toMatchObject({ kind: "candidates" });
    expect(lookup("없는회사", U)).toEqual({ kind: "none" });
    expect(lookup("  ", U)).toEqual({ kind: "none" });
  });
});

describe("parseNewsRss", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const item = (title: string, source: string, date: string, link = "https://news.google.com/rss/articles/x") =>
    `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><source url="https://s.example">${source}</source></item>`;
  const xml = `<rss><channel>${[
    item("삼성전자, &quot;급락&quot; 원인은? - 매일경제", "매일경제", "Wed, 25 Nov 2026 12:31:35 GMT", "https://news.google.com/rss/articles/a"),
    item("삼성전자 상승 &amp; 반등 - 한경", "한경", "Thu, 26 Nov 2026 01:00:00 GMT", "https://news.google.com/rss/articles/b"),
    item("삼성전자 상승 &amp; 반등 - 한경", "한경", "Thu, 26 Nov 2026 01:00:00 GMT", "https://news.google.com/rss/articles/c"),
    item("오래된 기사 - 한경", "한경", "Mon, 01 Jan 2024 00:00:00 GMT", "https://news.google.com/rss/articles/d"),
    item("http 링크 - 한경", "한경", "Thu, 26 Nov 2026 02:00:00 GMT", "http://insecure.example/e"),
  ].join("")}</channel></rss>`;

  it("출처 꼬리표를 떼고, 엔티티를 풀고, 최신순으로", () => {
    const items = parseNewsRss(xml, now);
    expect(items.map((i) => i.title)).toEqual(["삼성전자 상승 & 반등", '삼성전자, "급락" 원인은?']);
    expect(items[0].source).toBe("한경");
  });
  it("중복 제목·오래된 기사·https 가 아닌 링크는 뺀다", () => {
    const items = parseNewsRss(xml, now);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.title.includes("오래된") || i.title.includes("http"))).toBe(false);
  });
});

const ROWS: StatementRow[] = [
  { date: "2024-12-31", totalRevenue: 800, operatingIncome: 80, netIncome: 60, commonStockEquity: 500, totalLiabilitiesNetMinorityInterest: 250, operatingCashFlow: 90, capitalExpenditure: -40 },
  { date: "2025-12-31", totalRevenue: 1000, operatingIncome: 120, netIncome: 90, netIncomeCommonStockholders: 88, commonStockEquity: 600, totalEquityGrossMinorityInterest: 620, totalLiabilitiesNetMinorityInterest: 310, operatingCashFlow: 130, capitalExpenditure: -50, dilutedEPS: 1234 },
];
const QUOTE = { symbol: "T.KS", name: "테스트", currency: "KRW", price: 1000, marketCap: 1760 };

describe("computeFundamentals", () => {
  const f = computeFundamentals(QUOTE, ROWS);
  const m = (k: string) => f.metrics.find((x) => x.key === k)!;
  it("PER·PBR 은 시가총액 기준", () => {
    expect(m("per").value).toBeCloseTo(1760 / 88, 6);
    expect(m("pbr").value).toBeCloseTo(1760 / 600, 6);
  });
  it("ROE 는 기초·기말 평균 자본", () => {
    expect(m("roe").value).toBeCloseTo((88 / ((600 + 500) / 2)) * 100, 6);
    expect(m("roe").formula).toContain("평균");
  });
  it("부채비율은 자본총계(소수주주 포함)로, 이익률과 증가율", () => {
    expect(m("debtRatio").value).toBeCloseTo((310 / 620) * 100, 6);
    expect(m("opMargin").value).toBeCloseTo(12, 6);
    expect(m("revenueGrowth").value).toBeCloseTo(25, 6);
    expect(m("niGrowth").value).toBeCloseTo((88 / 60 - 1) * 100, 6);
  });
  it("FCF 는 보고값이 없으면 영업CF + 설비투자", () => {
    expect(m("fcf").value).toBe(130 - 50);
    expect(m("eps").value).toBe(1234);
  });
  it("모든 지표에 계산식이 있다", () => {
    for (const x of f.metrics) expect(x.formula.length).toBeGreaterThan(5);
  });
  it("적자면 PER 을 계산하지 않고 이유를 적는다", () => {
    const loss = computeFundamentals(QUOTE, [{ ...ROWS[1], netIncome: -5, netIncomeCommonStockholders: -5 }]);
    const per = loss.metrics.find((x) => x.key === "per")!;
    expect(per.value).toBeNull();
    expect(per.display).toBe("–");
    expect(per.formula).toContain("계산하지 않음");
  });
  it("값이 비어 있어도 던지지 않고 '–' 로", () => {
    const empty = computeFundamentals(QUOTE, [{ date: "2025-12-31" }]);
    expect(empty.metrics.every((x) => x.value === null || typeof x.value === "number")).toBe(true);
    expect(empty.metrics.find((x) => x.key === "roe")!.display).toBe("–");
  });
  it("값이 하나도 없는 연도는 빼고 최근 5개년만 남긴다", () => {
    const many: StatementRow[] = [
      { date: "2019-12-31" },
      ...[2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, totalRevenue: 100 + y - 2020, netIncome: 10, commonStockEquity: 100 })),
    ];
    const g = computeFundamentals(QUOTE, many);
    expect(g.history.map((h) => h.year)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
  });
  it("금융업은 부채비율에 주의 문구를 붙이고 AI 에게도 전달한다", () => {
    const bank = computeFundamentals(QUOTE, [{ ...ROWS[1], totalLiabilitiesNetMinorityInterest: 9000 }], { sector: "금융" });
    const d = bank.metrics.find((x) => x.key === "debtRatio")!;
    expect(d.note).toContain("금융업");
    expect(d.formula).toContain("일반 기업과 비교할 수 없음");
    expect(factsForJudge(bank)["부채비율"]).toContain("일반 기업과 비교할 수 없음");
    const normal = computeFundamentals(QUOTE, ROWS, { sector: "반도체" });
    expect(normal.metrics.find((x) => x.key === "debtRatio")!.note).toBeUndefined();
  });
  it("증가율 계산식은 값이 없거나 전년이 0 이하일 때 이유만 적는다", () => {
    const f2 = computeFundamentals(QUOTE, [{ date: "2024-12-31", netIncome: -3, commonStockEquity: 10 }, { date: "2025-12-31", netIncome: 5, commonStockEquity: 10 }]);
    const g = f2.metrics.find((x) => x.key === "niGrowth")!;
    expect(g.value).toBeNull();
    expect(g.formula).toBe("전년 순이익이 0 이하라 증가율을 계산하지 않음");
    expect(f2.metrics.find((x) => x.key === "revenueGrowth")!.formula).toBe("매출 값이 없어 계산하지 않음");
  });
  it("재무제표가 아예 없으면 오류", () => {
    expect(() => computeFundamentals(QUOTE, [])).toThrow();
  });
  it("판단용 확정 수치는 화면 표시값과 같은 문자열", () => {
    const facts = factsForJudge(f);
    expect(facts["PER"]).toBe(m("per").display);
    expect(facts["ROE"]).toBe(m("roe").display);
    expect(facts["연도별 순이익"]).toContain("2025년");
  });
});

describe("buildPrompt / parseOpinion / judgeStock", () => {
  const inv = INVESTORS[0];
  const news = Array.from({ length: 40 }, (_, i) => ({ title: `아주 긴 뉴스 제목 ${i} `.repeat(6), source: "매체", link: `https://x/${i}`, publishedAt: "2026-11-25T00:00:00Z" }));
  it("확정 수치·뉴스 제목이 들어가고 3천 자를 넘지 않는다", () => {
    const p = buildPrompt(inv, "삼성전자", { PER: "25.9배", ROE: "9.9%" }, news, "2026-11-26");
    expect(p).toContain("지금 고민 중인 종목은 삼성전자");
    expect(p).toContain("- PER: 25.9배");
    expect(p).toContain("\n[최근 뉴스 제목]\n- ");
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p).not.toContain("[종목]");
  });
  it("뉴스가 없으면 뉴스 구역을 만들지 않는다", () => {
    expect(buildPrompt(inv, "X", { PER: "1배" }, [], "2026-11-26")).not.toContain("\n[최근 뉴스 제목]\n");
  });
  it("판정·확신도·이유를 읽고, 마크다운·범위를 처리한다", () => {
    const o = parseOpinion("버핏", "🎩", "**판정:** 중립\n**확신도:** 150\n이유:\n1. 가\n2. 나\n- 다\n4. 라");
    expect(o).toMatchObject({ verdict: "중립", confidence: 100, reasons: ["가", "나", "다"] });
    expect(parseOpinion("x", "", "모르겠어요").verdict).toBe("판단불가");
    expect(parseOpinion("x", "", "판정: 사자 (처음)\n...\n판정: 팔자").verdict).toBe("팔자");
  });
  it("한 투자자가 실패해도 나머지는 결과를 낸다", async () => {
    const llm = vi.fn(async (p: string) => {
      if (p.includes("찰리 멍거")) throw new Error("quota");
      return "판정: 사자\n확신도: 70\n이유:\n1. a\n2. b\n3. c";
    });
    const ops = await judgeStock("삼성전자", { PER: "1배" }, [], llm, "2026-11-26");
    expect(ops).toHaveLength(INVESTORS.length);
    expect(ops.filter((o) => o.verdict === "사자")).toHaveLength(INVESTORS.length - 1);
    expect(ops.find((o) => o.investor === "찰리 멍거")).toMatchObject({ verdict: "판단불가", error: "quota" });
  });
});

describe("nvidia", () => {
  it("키는 KEY, KEY_2 … 형식만 인식한다 (밑줄 없는 KEY2 는 무시)", () => {
    expect(nvidiaKeys({ NVIDIA_API_KEY: "a", NVIDIA_API_KEY_2: "b", NVIDIA_API_KEY3: "c", NVIDIA_API_KEY_4: "d" })).toEqual(["a", "b", "d"]);
    expect(nvidiaKeys({})).toEqual([]);
  });
  it("<think> 블록을 떼어 낸다", () => {
    expect(stripThinking("<think>생각…</think>\n판정: 사자")).toBe("판정: 사자");
  });
  it("429 면 다음 키로 넘어가고, 모두 막히면 오류", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k1");
    vi.stubEnv("NVIDIA_API_KEY_2", "k2");
    const seen: string[] = [];
    const fake = (async (_u: unknown, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).authorization;
      seen.push(auth);
      if (auth === "Bearer k1") return new Response("limit", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "<think>x</think>판정: 중립" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await nvidiaChat("hi", fake)).toBe("판정: 중립");
    expect(seen).toContain("Bearer k1");
    expect(seen.at(-1)).toBe("Bearer k2");

    const allBlocked = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(nvidiaChat("hi", allBlocked)).rejects.toThrow(/401/);
    vi.unstubAllEnvs();
  });
  it("키가 없으면 분명한 오류", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    await expect(nvidiaChat("hi")).rejects.toThrow(/NVIDIA_API_KEY/);
    vi.unstubAllEnvs();
  });
});

describe("store (메모리 모드)", () => {
  it("하루 상한을 넘기면 false, 반납하면 다시 쓸 수 있다", async () => {
    const day = "2099-01-01";
    expect(await consumeAiCalls(day, 4, 10)).toBe(true);
    expect(await consumeAiCalls(day, 4, 10)).toBe(true);
    expect(await consumeAiCalls(day, 4, 10)).toBe(false); // 12 > 10
    expect(await consumeAiCalls(day, -4, 10)).toBe(true); // 반납
    expect(await consumeAiCalls(day, 4, 10)).toBe(true);
    expect(await consumeAiCalls(day, -100, 10)).toBe(false); // 음수로 내려가지 않는다
  });
  it("같은 날 같은 종목은 저장된 판단을 돌려준다", async () => {
    const j = { code: "005930", name: "삼성전자", day: "2099-01-02", createdAt: "2099-01-02T00:00:00Z", model: "m", opinions: [] };
    expect(await getJudgment("005930", "2099-01-02")).toBeNull();
    await saveJudgment(j);
    expect(await getJudgment("005930", "2099-01-02")).toEqual(j);
    expect(await getJudgment("005930", "2099-01-03")).toBeNull();
  });
});
