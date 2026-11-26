import { describe, expect, it, vi } from "vitest";
import type { Fundamentals } from "./fundamentals";
import { FRESH_HOURS, getFundamentals, type Deps } from "./fundamentalsSource";

const F = { name: "테스트", symbol: "000000.KS" } as unknown as Fundamentals;
const NOW = new Date("2026-01-10T00:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function deps(over: Partial<Deps>): Deps {
  return { cacheGet: async () => null, cacheSave: async () => undefined, live: async () => F, now: () => NOW, ...over };
}

describe("getFundamentals", () => {
  it("신선한 캐시면 야후를 부르지 않는다", async () => {
    const live = vi.fn();
    const r = await getFundamentals("1", deps({ cacheGet: async () => ({ f: F, fetchedAt: ago(5) }), live }));
    expect(r.source).toBe("cache");
    expect(live).not.toHaveBeenCalled();
  });
  it("오래된 캐시면 새로 계산해 저장한다", async () => {
    const save = vi.fn(async () => undefined);
    const r = await getFundamentals("1", deps({ cacheGet: async () => ({ f: F, fetchedAt: ago(FRESH_HOURS + 1) }), cacheSave: save }));
    expect(r.source).toBe("live");
    expect(save).toHaveBeenCalledOnce();
  });
  it("야후 실패 + 오래된 캐시 → stale-cache", async () => {
    const r = await getFundamentals("1", deps({ cacheGet: async () => ({ f: F, fetchedAt: ago(500) }), live: async () => Promise.reject(new Error("blocked")) }));
    expect(r.source).toBe("stale-cache");
  });
  it("야후 실패 + 캐시 없음 → 오류", async () => {
    await expect(getFundamentals("1", deps({ live: async () => Promise.reject(new Error("blocked")) }))).rejects.toThrow("blocked");
  });
  it("캐시 읽기·저장 실패는 조회를 막지 않는다", async () => {
    const r = await getFundamentals("1", deps({ cacheGet: async () => Promise.reject(new Error("db")), cacheSave: async () => Promise.reject(new Error("db")) }));
    expect(r.source).toBe("live");
  });
});
