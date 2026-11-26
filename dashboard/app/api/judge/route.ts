import { NextResponse } from "next/server";
import { createJudgment } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { code: "005930" } -> 투자자 판단. 접속 비밀번호(middleware)로 보호된다. */
export async function POST(req: Request) {
  let code = "";
  try {
    code = String(((await req.json()) as { code?: unknown }).code ?? "");
  } catch {
    /* 아래에서 400 */
  }
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "종목 코드는 6자리 숫자여야 합니다." }, { status: 400 });

  const result = await createJudgment(code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ judgment: result.judgment, cached: result.cached });
}
