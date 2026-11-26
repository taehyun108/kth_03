import { NextResponse } from "next/server";
import { consumeAiCalls } from "@/lib/store";
import { fetchNews } from "@/lib/news";
import { isJson, isSameOrigin } from "@/lib/origin";
import { kstDay } from "@/lib/judge";
import { nvidiaComplete } from "@/lib/nvidia";
import { resolveSymbol } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Out = { ok: boolean; message: string };

/** POST { target: "yahoo" | "news" | "ai" } — 배포한 서버에서 외부 접속이 실제로 되는지 한 번씩 시험한다. */
export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!isJson(req.headers)) return NextResponse.json({ error: "JSON 으로 요청해 주세요." }, { status: 415 });
  let target = "";
  try {
    target = String(((await req.json()) as { target?: unknown }).target ?? "");
  } catch {
    /* 아래에서 400 */
  }
  const t0 = Date.now();
  const done = (o: Out) => NextResponse.json({ ...o, ms: Date.now() - t0 });
  try {
    if (target === "yahoo") {
      const r = await resolveSymbol("005930");
      return done(r ? { ok: true, message: `삼성전자 현재가 ${r.quote.price}원을 받았습니다.` } : { ok: false, message: "응답은 왔지만 시세가 비어 있습니다." });
    }
    if (target === "news") {
      const n = await fetchNews("삼성전자", 3);
      return done(n.length ? { ok: true, message: `뉴스 ${n.length}건을 받았습니다.` } : { ok: false, message: "응답은 왔지만 최근 뉴스가 없습니다." });
    }
    if (target === "ai") {
      // 하루 호출 상한에 1회로 계산한다. 실패하면 반납한다.
      const day = kstDay();
      if (!(await consumeAiCalls(day, 1))) return done({ ok: false, message: "오늘 AI 호출 상한에 도달했거나 저장소가 연결되지 않았습니다." });
      try {
        const r = await nvidiaComplete("한국어로 '확인'이라고만 답하세요.");
        return done(r.text.trim() ? { ok: true, message: `${r.model} 이(가) 답했습니다: ${r.text.trim().slice(0, 40)}` } : { ok: false, message: `모델이 빈 답을 보냈습니다 (${r.finishReason ?? "?"}). NVIDIA_MODEL 을 바꿔 보세요.` });
      } catch (e) {
        await consumeAiCalls(day, -1).catch(() => false);
        throw e;
      }
    }
    return NextResponse.json({ error: "알 수 없는 시험 대상입니다." }, { status: 400 });
  } catch (e) {
    return done({ ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류" });
  }
}
