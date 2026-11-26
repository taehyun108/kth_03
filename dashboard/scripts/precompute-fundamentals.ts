/**
 * 종목 목록(universe.json) 전체의 재무 지표를 미리 계산해 Supabase 에 저장한다 (GitHub Actions 에서 실행).
 *   npx tsx scripts/precompute-fundamentals.ts
 * 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. 야후 접속이 막히면 실패로 표시된다.
 */
import { UNIVERSE } from "../lib/universe";
import { hasSupabase, saveFundamentalsCache } from "../lib/store";
import { loadFundamentals } from "../lib/yahoo";

const CONCURRENCY = 3;
const MIN_OK_RATIO = 0.5;

async function one(code: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await saveFundamentalsCache(code, await loadFundamentals(code));
      return true;
    } catch (err) {
      if (attempt === 2) console.error(`실패 ${code} — ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      else await new Promise((r) => setTimeout(r, 1500)); // 한 번 재시도
    }
  }
  return false;
}

async function main(): Promise<number> {
  if (!hasSupabase()) {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 건너뜁니다.");
    return 0;
  }
  const queue = UNIVERSE.map((u) => u.code);
  let ok = 0;
  let done = 0;
  const worker = async () => {
    for (let code = queue.shift(); code; code = queue.shift()) {
      if (await one(code)) ok++;
      if (++done % 20 === 0) console.log(`진행 ${done}/${UNIVERSE.length} (성공 ${ok})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`완료 — 성공 ${ok}/${UNIVERSE.length}`);
  return ok / UNIVERSE.length >= MIN_OK_RATIO ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
