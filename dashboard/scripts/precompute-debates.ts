/**
 * 장 마감 후 산업별 시장 토론을 만들어 저장한다 (GitHub Actions 에서 실행).
 *   npx tsx scripts/precompute-debates.ts
 * 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY(_2…)
 * 수집기가 올린 최신 시세(quotes_latest)로 산업별 거래 현황을 만들고, 산업 뉴스와 함께 투자자들이 토론한다.
 */
import { getSnapshot } from "../lib/data";
import { createSectorDebate } from "../lib/debatePipeline";
import { nvidiaKeys } from "../lib/nvidia";
import { sectorsOf } from "../lib/rank";
import { hasSupabase } from "../lib/store";

async function main(): Promise<number> {
  if (!hasSupabase()) {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 건너뜁니다.");
    return 0;
  }
  if (nvidiaKeys().length === 0) {
    console.log("NVIDIA_API_KEY 가 없어 건너뜁니다.");
    return 0;
  }
  const snapshot = await getSnapshot();
  if (snapshot.source !== "supabase") {
    console.error(`수집된 시세를 읽지 못해 토론을 만들지 않습니다. ${snapshot.warning ?? ""}`);
    return 1;
  }

  const sectors = sectorsOf(snapshot.stocks);
  console.log(`${sectors.length}개 산업 토론을 시작합니다 (시세 기준일 ${snapshot.barDate}).`);
  let made = 0;
  let cached = 0;
  let failed = 0;
  for (const sector of sectors) {
    const r = await createSectorDebate(sector, snapshot.stocks);
    if (r.ok) {
      if (r.cached) cached++;
      else made++;
      const v = r.debate.votes;
      console.log(`${r.cached ? "이미 있음" : "생성"} ${sector} → ${r.debate.label} (성장 ${v.성장} · 보합 ${v.보합} · 침체 ${v.침체})`);
    } else {
      failed++;
      console.error(`실패 ${sector} — ${r.error}`);
      if (r.status === 429) {
        console.error("오늘 AI 호출 한도에 도달해 멈춥니다.");
        break;
      }
    }
  }
  console.log(`완료 — 생성 ${made}, 이미 있음 ${cached}, 실패 ${failed}`);
  return made + cached === 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
