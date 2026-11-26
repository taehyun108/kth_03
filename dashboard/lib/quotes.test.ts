import { describe, expect, it } from "vitest";
import { INVESTORS } from "./investors.generated";
import { QUOTES, dayNumber, quoteOfDay, type InvestorQuotes } from "./quotes";

const METHODS = ["원문 문자열 대조", "책 스캔 검색 발췌"];

describe("quotes.json (확인된 명언만)", () => {
  it("투자자 이름·아이콘이 investors/*.md 와 같고 관점이 있다", () => {
    for (const q of QUOTES) {
      const inv = INVESTORS.find((i) => i.name === q.name);
      expect(inv, `${q.name} 은 investors/ 에 없는 투자자`).toBeDefined();
      expect(q.icon).toBe(inv!.icon);
      expect(q.philosophy.length).toBeGreaterThan(20);
      expect(q.quotes.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("모든 명언에 원문·번역·https 출처·확인 방법·확인 날짜가 있다", () => {
    for (const inv of QUOTES) {
      for (const q of inv.quotes) {
        const where = `${inv.name}: ${q.en.slice(0, 40)}`;
        expect(q.en.trim().length, where).toBeGreaterThan(10);
        expect(q.ko, where).toMatch(/[가-힣]/);
        expect(q.ko.length, `${where} (화면에 들어가도록 120자 이내)`).toBeLessThanOrEqual(120);
        expect(q.source.url, where).toMatch(/^https:\/\//);
        expect(q.source.title.length, where).toBeGreaterThan(3);
        expect(q.source.detail.length, where).toBeGreaterThan(2);
        expect(METHODS, where).toContain(q.verification.method);
        expect(q.verification.checkedAt, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  it("'원문 문자열 대조' 는 다시 찾아볼 문구(checks)가 있고, 그 문구는 명언 본문에서 따온 것이다", () => {
    for (const inv of QUOTES) {
      for (const q of inv.quotes) {
        const v = q.verification;
        if (v.method !== "원문 문자열 대조") {
          expect(v.checks, `${q.en.slice(0, 30)} (발췌 확인은 checks 없음)`).toBeUndefined();
          expect(v.note, "발췌 확인은 왜 전문 대조를 못 했는지 적어야 한다").toBeTruthy();
          continue;
        }
        expect(v.checks?.length, q.en.slice(0, 30)).toBeGreaterThan(0);
        // checks 는 소문자로 저장했고, 명언 본문의 핵심 단어가 들어 있어야 한다(엉뚱한 문구를 붙인 실수 방지)
        const words = q.en.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.length > 4);
        const joined = v.checks!.join(" ").toLowerCase();
        const hit = words.filter((w) => joined.includes(w)).length;
        expect(hit / Math.max(1, words.length), q.en.slice(0, 30)).toBeGreaterThan(0.5);
        // textUrl 이 없으면 PDF 라서 수동 확인이라고 표시돼 있어야 한다
        if (!v.textUrl) expect(v.manualOnly, q.en.slice(0, 30)).toBe(true);
      }
    }
  });
  it("같은 영어 문장이 중복되지 않는다", () => {
    const all = QUOTES.flatMap((i) => i.quotes.map((q) => q.en.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("dayNumber", () => {
  it("날짜를 날 수로 바꾸고, 잘못된 형식은 null", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2026-11-27")! - dayNumber("2026-11-26")!).toBe(1);
    expect(dayNumber("2028-03-01")! - dayNumber("2028-02-29")!).toBe(1); // 윤일
    expect(dayNumber("2026/11/26")).toBeNull();
    expect(dayNumber("어제")).toBeNull();
    expect(dayNumber("")).toBeNull();
  });
});

describe("quoteOfDay", () => {
  const mk = (name: string, n: number): InvestorQuotes => ({
    key: name, name, icon: "x", philosophy: "관점",
    quotes: Array.from({ length: n }, (_, i) => ({ en: `${name}${i}`, ko: "가", source: { title: "t", detail: "d", url: "https://x" }, verification: { method: "원문 문자열 대조", checkedAt: "2026-01-01" } })),
  });
  const data = [mk("A", 3), mk("B", 2), mk("C", 4)];

  it("같은 날이면 항상 같은 결과", () => {
    expect(quoteOfDay("2026-11-26", data)).toEqual(quoteOfDay("2026-11-26", data));
  });
  it("하루에 한 명씩 돌아간다 (연속된 날은 다른 투자자, 3일마다 한 바퀴)", () => {
    const names = Array.from({ length: 9 }, (_, i) => quoteOfDay(`2026-12-${String(i + 1).padStart(2, "0")}`, data)!.investor.name);
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
    expect(names.slice(0, 3)).toEqual(names.slice(3, 6));
    expect(new Set(names.slice(0, 3)).size).toBe(3);
  });
  it("같은 투자자가 다시 나오면 그의 다음 명언으로 넘어가고, 모든 명언이 나온다", () => {
    const seen = new Map<string, string[]>();
    for (let i = 0; i < 360; i++) {
      const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const r = quoteOfDay(d, data)!;
      seen.set(r.investor.name, [...(seen.get(r.investor.name) ?? []), r.quote.en]);
    }
    for (const inv of data) {
      const list = seen.get(inv.name)!;
      expect(new Set(list).size, inv.name).toBe(inv.quotes.length); // 전부 한 번 이상
      for (let i = 1; i < list.length; i++) {
        const prev = inv.quotes.findIndex((q) => q.en === list[i - 1]);
        expect(inv.quotes[(prev + 1) % inv.quotes.length].en).toBe(list[i]); // 순서대로
      }
    }
  });
  it("명언이 없는 투자자는 건너뛰고, 데이터가 없거나 날짜가 틀리면 null", () => {
    const withEmpty = [mk("A", 2), { ...mk("빈사람", 1), quotes: [] }];
    for (let i = 0; i < 10; i++) expect(quoteOfDay(`2026-12-${String(i + 10)}`, withEmpty)!.investor.name).toBe("A");
    expect(quoteOfDay("2026-12-01", [])).toBeNull();
    expect(quoteOfDay("not-a-date", data)).toBeNull();
  });
  it("실제 데이터로 오늘 값이 나온다", () => {
    const r = quoteOfDay("2026-11-26");
    expect(r?.investor.name).toBeTruthy();
    expect(r?.quote.ko).toMatch(/[가-힣]/);
  });
});
