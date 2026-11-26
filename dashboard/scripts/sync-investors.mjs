// ../investors/*.md (투자자 프롬프트 원본) -> lib/investors.generated.ts
// Vercel 은 Root Directory(dashboard) 밖의 파일을 못 읽을 수 있어서, 변환 결과를 저장소에 함께 올린다.
// 프롬프트를 고치거나 투자자를 추가한 뒤:  npm run sync-investors
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "investors");
const outFile = join(here, "..", "lib", "investors.generated.ts");

export function parseInvestorFile(name, text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].startsWith("#")) throw new Error(`${name}: 첫 줄은 '# 이름' 이어야 합니다`);
  let body = lines.slice(1);
  let icon = "👤";
  while (body.length && /^\s*icon\s*[:：]/i.test(body[0])) {
    icon = body[0].replace(/^\s*icon\s*[:：]\s*/i, "").trim();
    body = body.slice(1);
  }
  const template = body.join("\n").trim();
  if (!template.includes("[종목]")) throw new Error(`${name}: 프롬프트에 [종목] 이 없습니다`);
  return { key: name.replace(/\.md$/, "").replace(/^\d+_/, ""), name: lines[0].replace(/^#+\s*/, "").trim(), icon, template };
}

export function buildGenerated() {
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort();
  const investors = files.map((f) => parseInvestorFile(f, readFileSync(join(srcDir, f), "utf8")));
  return (
    "// 자동 생성 파일 — 직접 고치지 마세요. 원본: ../investors/*.md, 갱신: npm run sync-investors\n" +
    "export type InvestorDef = { key: string; name: string; icon: string; template: string };\n\n" +
    `export const INVESTORS: InvestorDef[] = ${JSON.stringify(investors, null, 2)};\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(outFile, buildGenerated(), "utf8");
  console.log(`투자자 ${readdirSync(srcDir).filter((f) => f.endsWith(".md")).length}명 -> lib/investors.generated.ts`);
}
