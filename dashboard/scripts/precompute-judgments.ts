/**
 * 장 마감 후, 거래량 상위 종목의 투자자 판단을 미리 만들어 저장한다 (GitHub Actions 에서 실행).
 *   JUDGE_TOP_N=20 npx tsx scripts/precompute-judgments.ts
 * 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY(_2…)
 */
import { nvidiaKeys } from "../lib/nvidia";
import { createJudgment } from "../lib/pipeline";
import { hasSupabase, topVolumeCodes } from "../lib/store";

async function main(): Promise<number> {
  // 키·저장소를 아직 등록하지 않았다면 실패 대신 안내만 하고 정상 종료한다 (등록 전에도 워크플로가 빨갛게 되지 않게).
  if (!hasSupabase()) {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 건너뜁니다.");
    return 0;
  }
  if (nvidiaKeys().length === 0) {
    console.log("NVIDIA_API_KEY 가 없어 건너뜁니다.");
    return 0;
  }

  const topN = Number(process.env.JUDGE_TOP_N || 20);
  const targets = await topVolumeCodes(topN);
  console.log(`거래량 상위 ${targets.length}종목 판단을 시작합니다.`);

  let made = 0;
  let cached = 0;
  let failed = 0;
  for (const t of targets) {
    const r = await createJudgment(t.code);
    if (r.ok) {
      if (r.cached) cached++;
      else made++;
      const votes = r.judgment.opinions.map((o) => `${o.investor}:${o.verdict}`).join(" ");
      console.log(`${r.cached ? "이미 있음" : "생성"} ${t.name}(${t.code}) — ${votes}`);
    } else {
      failed++;
      console.error(`실패 ${t.name}(${t.code}) — ${r.error}`);
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
