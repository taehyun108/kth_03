import { NextResponse } from "next/server";
import { isJson, isSameOrigin } from "@/lib/origin";
import { createJudgment } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { code: "005930" } -> 투자자 판단. 접속 비밀번호(middleware)로 보호된다. */
export async function POST(req: Request) {
  // 다른 사이트에서 로그인된 사용자의 브라우저로 대신 호출하는 것(CSRF)을 막는다
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!isJson(req.headers)) return NextResponse.json({ error: "JSON 으로 요청해 주세요." }, { status: 415 });
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
