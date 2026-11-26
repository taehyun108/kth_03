/**
 * 상태를 바꾸는 요청(POST)이 우리 사이트에서 온 것인지 확인한다 (CSRF 방어).
 * 접속 비밀번호는 브라우저가 자동으로 붙여 보내므로, 다른 사이트의 페이지가 로그인된 사용자의 브라우저로
 * 이 API 를 대신 호출하게 만들 수 있다. 브라우저가 붙이는 Sec-Fetch-Site / Origin 헤더로 막는다.
 */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none"; // 'none' = 주소창에 직접 입력 등 사용자가 시작한 요청

  const origin = headers.get("origin");
  if (!origin) return true; // 브라우저가 아닌 호출(curl 등)은 Origin 이 없다 — 접속 비밀번호가 이미 막는다
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** JSON 본문인지. 다른 사이트의 단순 <form> 은 application/json 을 보낼 수 없다. */
export const isJson = (headers: Headers): boolean => (headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
