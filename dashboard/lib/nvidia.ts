/**
 * NVIDIA NIM(build.nvidia.com) 호출 — OpenAI 호환 엔드포인트.
 * KTH_01 에서 얻은 교훈을 따른다: 입력은 짧게(3천 자 이내), 키는 여러 개 등록해 한도(429)·인증 오류(401)면 다음 키로.
 *
 * 환경변수
 *   NVIDIA_API_KEY, NVIDIA_API_KEY_2 … _10   (밑줄 없는 KEY2 는 인식하지 않음)
 *   NVIDIA_MODEL        기본 minimaxai/minimax-m3.1-flash — 단종·미배포일 수 있으니 안 되면 바꾼다
 *   NVIDIA_TIMEOUT_SEC  기본 60
 */
export const ENDPOINT = process.env.NVIDIA_ENDPOINT || "https://integrate.api.nvidia.com/v1/chat/completions"; // NVIDIA_ENDPOINT 는 테스트용 재정의
export const DEFAULT_MODEL = "minimaxai/minimax-m3.1-flash";

export function nvidiaKeys(env: Record<string, string | undefined> = process.env): string[] {
  const keys: string[] = [];
  if (env.NVIDIA_API_KEY) keys.push(env.NVIDIA_API_KEY);
  for (let i = 2; i <= 10; i++) {
    const k = env[`NVIDIA_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

export function nvidiaModel(): string {
  return process.env.NVIDIA_MODEL || DEFAULT_MODEL;
}

export class NvidiaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** 추론 모델이 붙이는 <think>…</think> 를 떼어 낸다. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

let rotation = 0;

/** 프롬프트 하나를 보내고 답변 문자열을 받는다. 키가 없으면 NvidiaError. */
export async function nvidiaChat(prompt: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const keys = nvidiaKeys();
  if (keys.length === 0) throw new NvidiaError("NVIDIA_API_KEY 가 설정되지 않았습니다");
  const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_SEC || 60) * 1000;
  let lastError: NvidiaError = new NvidiaError("NVIDIA 호출 실패");

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[(rotation + attempt) % keys.length];
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: nvidiaModel(),
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1200,
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 429) {
        lastError = new NvidiaError(`NVIDIA HTTP ${res.status} (키 한도·인증)`, res.status);
        continue; // 다음 키
      }
      if (!res.ok) throw new NvidiaError(`NVIDIA HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = stripThinking(data.choices?.[0]?.message?.content ?? "");
      if (!text) throw new NvidiaError("NVIDIA 가 빈 답을 보냈습니다");
      rotation = (rotation + attempt) % keys.length;
      return text;
    } catch (err) {
      if (err instanceof NvidiaError) {
        if (err.status === 401 || err.status === 429) continue;
        throw err;
      }
      throw new NvidiaError(`NVIDIA 호출 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw lastError;
}
