/**
 * NVIDIA NIM(build.nvidia.com) 호출 — OpenAI 호환 엔드포인트.
 * KTH_01 에서 얻은 교훈을 따른다: 입력은 짧게(3천 자 이내), 키는 여러 개 등록해 한도(429)·인증 오류(401)면 다음 키로.
 *
 * 환경변수
 *   NVIDIA_API_KEY, NVIDIA_API_KEY_2 … _10   (밑줄 없는 KEY2 는 인식하지 않음)
 *   NVIDIA_MODEL        기본 minimaxai/minimax-m3.1-flash — 단종·미배포·'생각만 하고 답이 빈' 모델일 수 있다.
 *                       안 되면 `npm run nvidia:probe` 로 이 계정에서 되는 모델을 찾는다
 *   NVIDIA_MAX_TOKENS   기본 2000 (추론 모델은 생각에 토큰을 쓰므로 너무 작으면 답이 빈다)
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

const maxTokens = (): number => Number(process.env.NVIDIA_MAX_TOKENS || 2000);

export class NvidiaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** 추론 모델이 붙이는 <think>…</think> 를 떼어 낸다. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

type Choice = {
  finish_reason?: string | null;
  message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
};

export type Reply = { text: string; finishReason: string | null; hadReasoning: boolean };

/**
 * 응답 JSON 에서 답 글자를 꺼낸다. 'content' 가 비었는데 추론 칸에 '판정:' 형식의 답이 들어 있으면 그것을 쓴다
 * (일부 추론 모델이 답을 엉뚱한 칸에 넣는다). 둘 다 비면 text 는 빈 문자열.
 */
export function parseReply(data: { choices?: Choice[] }): Reply {
  const choice = data.choices?.[0];
  const content = stripThinking(choice?.message?.content ?? "");
  const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? "";
  const text = content || (/판정\s*[:：]/.test(reasoning) ? stripThinking(reasoning) : "");
  return { text, finishReason: choice?.finish_reason ?? null, hadReasoning: Boolean(reasoning.trim()) };
}

/** 빈 답일 때 원인을 짐작할 수 있는 안내 문구. */
export function emptyAnswerMessage(model: string, r: Reply): string {
  const why = r.finishReason === "length"
    ? "토큰 한도에서 잘렸습니다 — 추론 모델이 생각에 토큰을 다 쓴 것 같습니다. NVIDIA_MAX_TOKENS 를 늘리거나 NVIDIA_MODEL 을 일반 instruct 모델로 바꾸세요"
    : "NVIDIA_MODEL 을 바꿔 보세요 (npm run nvidia:probe 로 이 계정에서 되는 모델을 찾을 수 있습니다)";
  return `NVIDIA 가 빈 답을 보냈습니다 (모델 ${model}, finish_reason=${r.finishReason ?? "없음"}${r.hadReasoning ? ", 생각 내용만 있음" : ""}) — ${why}`;
}

let rotation = 0;

export type Completion = Reply & { model: string };

/** 프롬프트 하나를 보내고 답과 부가 정보를 받는다. model 을 주면 그 모델로 호출한다. 키가 없으면 NvidiaError. */
export async function nvidiaComplete(
  prompt: string,
  opts: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<Completion> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = opts.model ?? nvidiaModel();
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
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: maxTokens(),
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
      const reply = parseReply((await res.json()) as { choices?: Choice[] });
      if (!reply.text) throw new NvidiaError(emptyAnswerMessage(model, reply));
      rotation = (rotation + attempt) % keys.length;
      return { ...reply, model };
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

/** 프롬프트 하나를 보내고 답변 문자열을 받는다. */
export async function nvidiaChat(prompt: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  return (await nvidiaComplete(prompt, { fetchImpl })).text;
}

/** 이 키로 부를 수 있다고 카탈로그가 알려 주는 모델 id 목록. (카탈로그에 있어도 계정에 배포가 안 된 모델이 있을 수 있다) */
export async function listModels(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const key = nvidiaKeys()[0];
  if (!key) throw new NvidiaError("NVIDIA_API_KEY 가 설정되지 않았습니다");
  const res = await fetchImpl(ENDPOINT.replace(/\/chat\/completions$/, "/models"), {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new NvidiaError(`모델 목록 조회 실패 HTTP ${res.status}`, res.status);
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}
