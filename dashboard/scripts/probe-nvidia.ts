/**
 * 이 NVIDIA 키로 실제로 답을 주는 모델을 찾는다.
 *   npm run nvidia:probe
 * 카탈로그(모델 목록)에 있어도 이 계정에 배포가 안 됐거나(404), 생각만 하고 답이 빈 모델이 있어서
 * 실제 투자자 프롬프트로 몇 개를 직접 불러 보고 결과를 표로 보여 준다. 키 값은 출력하지 않는다.
 */
import { INVESTORS } from "../lib/investors.generated";
import { buildPrompt } from "../lib/judge";
import { NvidiaError, listModels, nvidiaComplete, nvidiaKeys, nvidiaModel } from "../lib/nvidia";
import { classifyAnswer, pickCandidates, type ProbeVerdict } from "../lib/nvidiaProbe";

// 개발 서버가 읽는 .env.local 을 이 스크립트도 읽는다 (Node 20.12+ / 22+)
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* 파일이 없으면 넘어간다 */
  }
}

const FALLBACK = ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct", "qwen/qwen2.5-7b-instruct", "mistralai/mistral-small-24b-instruct"];

async function main(): Promise<number> {
  if (nvidiaKeys().length === 0) {
    console.error("NVIDIA_API_KEY 가 없습니다. dashboard 폴더의 .env.local 에 NVIDIA_API_KEY=키 한 줄을 넣고 다시 실행하세요.");
    return 1;
  }
  const current = nvidiaModel();
  let ids: string[] = [];
  try {
    ids = await listModels();
    console.log(`모델 목록 ${ids.length}개를 받았습니다.`);
  } catch (e) {
    console.log(`모델 목록을 받지 못해(${e instanceof Error ? e.message : e}) 기본 후보로 시험합니다.`);
    ids = FALLBACK;
  }
  const candidates = pickCandidates(ids, current);
  const facts = { 현재가: "171,300원", 시가총액: "1115.5조", PER: "25.2배", PBR: "2.6배", ROE: "10.9%", 부채비율: "30%", 영업이익률: "13.1%" };
  const prompt = buildPrompt(INVESTORS[0], "삼성전자", facts, [], "2026-11-26");

  console.log(`\n시험할 모델 ${candidates.length}개 (현재 설정: ${current})\n`);
  const results: { model: string; verdict: ProbeVerdict; sec: number; note: string }[] = [];
  for (const model of candidates) {
    const t0 = Date.now();
    let verdict: ProbeVerdict;
    let note = "";
    try {
      const r = await nvidiaComplete(prompt, { model });
      verdict = classifyAnswer(r.text);
      note = verdict === "ok" ? "" : `형식 위반 (앞부분: ${r.text.replace(/\s+/g, " ").slice(0, 50)})`;
    } catch (e) {
      const msg = e instanceof NvidiaError ? e.message : String(e);
      verdict = /빈 답/.test(msg) ? "empty" : "error";
      note = msg.slice(0, 110);
    }
    const sec = (Date.now() - t0) / 1000;
    results.push({ model, verdict, sec, note });
    const mark = { ok: "✅ 사용 가능", format: "⚠️ 형식 위반", empty: "❌ 빈 답", error: "❌ 오류" }[verdict];
    console.log(`${mark.padEnd(10)} ${sec.toFixed(1).padStart(5)}초  ${model}${note ? `\n             ${note}` : ""}`);
  }

  // 빠른 순이 아니라 시험 순서(큰 일반 모델 우선)대로 첫 번째 성공 모델을 추천한다 — 작은 모델은 한국어 금융 판단이 약할 수 있다
  const best = results.find((r) => r.verdict === "ok");
  console.log("");
  if (best) {
    console.log(`추천: ${best.model} (${best.sec.toFixed(1)}초)${best.sec > 40 ? " — 느린 편입니다(투자자 4명이 동시에 부르면 더 걸릴 수 있음). 위 표에서 더 빠른 ✅ 모델을 골라도 됩니다" : ""}`);
    console.log(`dashboard/.env.local 에 아래 한 줄을 추가하고 npm run dev 를 다시 실행하세요.`);
    console.log(`NVIDIA_MODEL=${best.model}`);
    return 0;
  }
  console.log("사용 가능한 모델을 찾지 못했습니다. 위 표(모델 이름과 오류 문구)를 알려 주세요. 키 값은 보내지 마세요.");
  return 1;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
