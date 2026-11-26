import { NextResponse, type NextRequest } from "next/server";

/**
 * 접속 비밀번호(HTTP Basic 인증). 아이디는 아무거나, 비밀번호만 DASHBOARD_PASSWORD 와 같으면 통과한다.
 *  - 개발(npm run dev)에서 비밀번호가 없으면 그냥 연다.
 *  - 운영(production)에서 비밀번호가 없으면 전부 막는다 — 설정을 빠뜨려 공개되는 일이 없게(fail closed).
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("접속 비밀번호(DASHBOARD_PASSWORD)가 설정되지 않아 접속을 막았습니다.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      // atob 는 바이트 문자열을 돌려주므로 UTF-8 로 풀어야 한글 비밀번호도 맞는다.
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(given, password)) return NextResponse.next();
    } catch {
      /* 잘못된 헤더는 아래에서 401 */
    }
  }
  return new NextResponse("비밀번호가 필요합니다.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Economy Begin", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

/** 길이가 달라도 같은 시간이 걸리도록 끝까지 비교한다. */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
