import { describe, expect, it, vi } from "vitest";
import { emptyAnswerMessage, nvidiaComplete, parseReply } from "./nvidia";
import { PREFER, classifyAnswer, pickCandidates } from "./nvidiaProbe";

const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const reply = (message: Record<string, unknown>, finish = "stop") => ({ choices: [{ finish_reason: finish, message }] });

describe("parseReply", () => {
  it("content 가 있으면 그것을 쓰고 <think> 는 뗀다", () => {
    expect(parseReply(reply({ content: "<think>x</think>판정: 사자" })).text).toBe("판정: 사자");
  });
  it("content 가 비고 추론 칸에 '판정:' 형식이 있으면 그것을 쓴다", () => {
    const r = parseReply(reply({ content: "", reasoning_content: "…생각…\n판정: 중립\n확신도: 50" }));
    expect(r.text).toContain("판정: 중립");
    expect(parseReply(reply({ content: null, reasoning: "판정: 팔자" })).text).toBe("판정: 팔자");
  });
  it("추론 칸에 형식이 없으면 빈 답으로 본다 (생각 내용만 있음 표시)", () => {
    const r = parseReply(reply({ content: "", reasoning_content: "음… 이 회사는…" }, "length"));
    expect(r).toEqual({ text: "", finishReason: "length", hadReasoning: true });
  });
  it("choices 가 없어도 던지지 않는다", () => {
    expect(parseReply({})).toEqual({ text: "", finishReason: null, hadReasoning: false });
  });
});

describe("emptyAnswerMessage", () => {
  it("토큰 한도에서 잘렸으면 원인과 해결 방법을 알려 준다", () => {
    const m = emptyAnswerMessage("m/x", { text: "", finishReason: "length", hadReasoning: true });
    expect(m).toContain("m/x");
    expect(m).toContain("finish_reason=length");
    expect(m).toContain("생각 내용만 있음");
    expect(m).toContain("NVIDIA_MAX_TOKENS");
  });
  it("그 밖의 빈 답은 probe 도구를 안내한다", () => {
    expect(emptyAnswerMessage("m/x", { text: "", finishReason: "stop", hadReasoning: false })).toContain("nvidia:probe");
  });
});

describe("nvidiaComplete", () => {
  it("model 을 지정하면 그 모델로 호출하고 max_tokens 환경변수를 쓴다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    vi.stubEnv("NVIDIA_MAX_TOKENS", "3333");
    const seen: { model?: string; max_tokens?: number }[] = [];
    const f = (async (_u: unknown, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string));
      return resp(reply({ content: "판정: 사자" }));
    }) as unknown as typeof fetch;
    const r = await nvidiaComplete("hi", { model: "meta/foo", fetchImpl: f });
    expect(r).toMatchObject({ text: "판정: 사자", model: "meta/foo" });
    expect(seen[0]).toMatchObject({ model: "meta/foo", max_tokens: 3333 });
    vi.unstubAllEnvs();
  });
  it("빈 답이면 원인이 담긴 오류를 던진다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const f = (async () => resp(reply({ content: "", reasoning_content: "생각만" }, "length"))) as unknown as typeof fetch;
    await expect(nvidiaComplete("hi", { model: "a/b", fetchImpl: f })).rejects.toThrow(/finish_reason=length.*NVIDIA_MAX_TOKENS/);
    vi.unstubAllEnvs();
  });
});

describe("pickCandidates / classifyAnswer", () => {
  const IDS = [
    "meta/llama-3.3-70b-instruct", "meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct",
    "qwen/qwen2.5-7b-instruct", "nvidia/nv-embedqa-e5-v5", "nvidia/llama-guard-4", "meta/llama-3.2-90b-vision-instruct",
    "stabilityai/stable-diffusion-xl", "qwen/qwen2.5-coder-32b-instruct", "minimaxai/minimax-m3.1-flash", "google/gemma-2-9b-it",
  ];
  it("현재 모델이 맨 앞, 임베딩·안전·이미지·코드·비전 모델은 뺀다", () => {
    const c = pickCandidates(IDS, "minimaxai/minimax-m3.1-flash");
    expect(c[0]).toBe("minimaxai/minimax-m3.1-flash");
    for (const bad of ["embedqa", "guard", "vision", "stable-diffusion", "coder"]) expect(c.some((x) => x.includes(bad)), bad).toBe(false);
    expect(c).toContain("meta/llama-3.3-70b-instruct");
  });
  it("우선순위대로 정렬하고 개수 제한·중복 없음", () => {
    const c = pickCandidates(IDS, "x/current", 4);
    expect(c).toHaveLength(4);
    expect(new Set(c).size).toBe(4);
    expect(c[1]).toBe("meta/llama-3.3-70b-instruct");
  });
  it("목록에 현재 모델이 있어도 두 번 넣지 않는다", () => {
    const c = pickCandidates(IDS, "meta/llama-3.3-70b-instruct");
    expect(c.filter((x) => x === "meta/llama-3.3-70b-instruct")).toHaveLength(1);
  });
  it("우선순위 키워드가 정해져 있다", () => {
    expect(PREFER.length).toBeGreaterThan(5);
  });
  it("판정 형식을 지킨 답만 ok", () => {
    expect(classifyAnswer("분석…\n판정: 사자\n확신도: 70")).toBe("ok");
    expect(classifyAnswer("**판정:** 중립")).toBe("ok"); // 앱(parseOpinion)도 굵은 글씨는 읽는다
    expect(classifyAnswer("이 회사는 좋아 보입니다.")).toBe("format");
  });
});
