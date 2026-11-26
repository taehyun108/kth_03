import type { Fundamentals } from "./fundamentals";
import { getFundamentalsCache, saveFundamentalsCache, type CachedFundamentals } from "./store";
import { loadFundamentals } from "./yahoo";

export type FundSource = "cache" | "live" | "stale-cache";
export type FundResult = { f: Fundamentals; source: FundSource; fetchedAt: string };

/** 이 시간 안에 계산한 캐시는 그대로 쓴다 (결산 자료는 거의 안 바뀌고, 평일 장 마감 후 매일 갱신된다. 주말·연휴 여유 포함). */
export const FRESH_HOURS = 72;

export type Deps = {
  cacheGet: (code: string) => Promise<CachedFundamentals | null>;
  cacheSave: (code: string, f: Fundamentals) => Promise<void>;
  live: (code: string) => Promise<Fundamentals>;
  now: () => Date;
};

const defaultDeps: Deps = {
  cacheGet: getFundamentalsCache,
  cacheSave: (code, f) => saveFundamentalsCache(code, f),
  live: loadFundamentals,
  now: () => new Date(),
};

/**
 * 재무 지표를 가져온다.
 *  1) 신선한 캐시가 있으면 야후를 부르지 않고 그것을 쓴다 (빠르고, 서버에서 야후가 막혀도 동작)
 *  2) 없거나 오래됐으면 야후에서 계산해 캐시에 저장한다
 *  3) 야후가 실패했는데 오래된 캐시가 있으면 그것을 쓴다(source='stale-cache')
 */
export async function getFundamentals(code: string, deps: Deps = defaultDeps): Promise<FundResult> {
  const cached = await deps.cacheGet(code).catch(() => null);
  const now = deps.now();
  if (cached && now.getTime() - new Date(cached.fetchedAt).getTime() < FRESH_HOURS * 3_600_000) {
    return { f: cached.f, source: "cache", fetchedAt: cached.fetchedAt };
  }
  try {
    const f = await deps.live(code);
    await deps.cacheSave(code, f).catch(() => undefined); // 저장 실패는 조회를 막지 않는다
    return { f, source: "live", fetchedAt: now.toISOString() };
  } catch (err) {
    if (cached) return { f: cached.f, source: "stale-cache", fetchedAt: cached.fetchedAt };
    throw err;
  }
}
