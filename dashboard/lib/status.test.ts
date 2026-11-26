import { describe, expect, it } from "vitest";
import { buildChecks, type StatusInput } from "./status";

const NOW = new Date("2026-01-10T03:00:00Z");
const base: StatusInput = {
  production: true, passwordSet: true, nvidiaKeys: 1, model: "m", modelDefault: false, cap: 300, supabase: true,
  overview: { quotes: { count: 161, latest: "2026-01-10T02:55:00Z" }, fundamentalsCount: 161, judgmentsToday: 20, debates: { latestDay: "2026-01-10", count: 8 }, aiCallsToday: 10 },
  overviewError: null, universe: 161, now: NOW,
};
const lv = (s: StatusInput) => Object.fromEntries(buildChecks(s).map((c) => [c.id, c.level]));

describe("buildChecks", () => {
  it("모두 정상", () => {
    expect(Object.values(lv(base)).every((l) => l === "ok")).toBe(true);
  });
  it("운영에서 비밀번호·키 없음은 bad", () => {
    const r = lv({ ...base, passwordSet: false, nvidiaKeys: 0 });
    expect(r.password).toBe("bad");
    expect(r.nvidia).toBe("bad");
  });
  it("Supabase 없으면 이후 항목 생략", () => {
    const c = buildChecks({ ...base, supabase: false, overview: null });
    expect(c.find((x) => x.id === "supabase")?.level).toBe("bad");
    expect(c.find((x) => x.id === "quotes")).toBeUndefined();
  });
  it("테이블 읽기 실패는 schema.sql 안내", () => {
    const c = buildChecks({ ...base, overview: null, overviewError: "HTTP 404" });
    expect(c.find((x) => x.id === "supabase")?.fix).toContain("schema.sql");
  });
  it("시세 0건·호출 상한 도달", () => {
    const r = lv({ ...base, overview: { ...base.overview!, quotes: { count: 0, latest: null }, aiCallsToday: 300 } });
    expect(r.quotes).toBe("bad");
    expect(r.cap).toBe("bad");
  });
  it("일부 종목만 수집되면 warn", () => {
    expect(lv({ ...base, overview: { ...base.overview!, quotes: { count: 100, latest: "2026-01-10T02:55:00Z" } } }).quotes).toBe("warn");
  });
});
