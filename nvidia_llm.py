"""NVIDIA NIM(build.nvidia.com) 호출 — 표준 라이브러리만 쓴다(봇에 추가 설치가 필요 없다).

investor_advisor.run_stock_command(query, llm, ...) 의 llm 인자로 그대로 넘긴다.

    from nvidia_llm import make_llm
    llm_call = make_llm()                      # 프롬프트 문자열 -> 답변 문자열

환경변수(.env 에 넣고 봇이 읽게 한다)
  NVIDIA_API_KEY, NVIDIA_API_KEY_2 … _10   키 여러 개면 한도(429)·인증 오류(401)에서 다음 키로 넘어간다
  NVIDIA_MODEL        기본 minimaxai/minimax-m3.1-flash — 단종·미배포·'생각만 하고 답이 빈' 모델일 수 있다.
                      대시보드의 `npm run nvidia:probe` 로 이 계정에서 되는 모델을 찾아 여기에 넣는다
  NVIDIA_MAX_TOKENS   기본 2000 (추론 모델은 생각에 토큰을 쓰므로 너무 작으면 답이 빈다)
  NVIDIA_TIMEOUT_SEC  기본 60

KTH_01 에서 얻은 교훈: 입력은 3천 자 이내로 짧게(길면 무료 NVIDIA 가 응답하지 못함).
investor_advisor 가 만드는 프롬프트는 약 1~2천 자라 괜찮다.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Callable, Optional

ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_MODEL = "minimaxai/minimax-m3.1-flash"


class NvidiaError(Exception):
    """호출에 실패했다. 메시지는 사용자에게 그대로 보여 줘도 되는 수준(키 값은 넣지 않는다)."""


def api_keys(env=None) -> list[str]:
    env = os.environ if env is None else env
    keys = [env["NVIDIA_API_KEY"]] if env.get("NVIDIA_API_KEY") else []
    for i in range(2, 11):                      # 밑줄 없는 NVIDIA_API_KEY2 는 인식하지 않는다
        if env.get(f"NVIDIA_API_KEY_{i}"):
            keys.append(env[f"NVIDIA_API_KEY_{i}"])
    return keys


def parse_reply(data: dict) -> tuple[str, str, bool]:
    """응답 JSON -> (답, finish_reason, 생각 내용 유무). content 가 비고 추론 칸에 '판정:' 형식이 있으면 그것을 쓴다."""
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = strip_thinking(msg.get("content") or "")
    reasoning = msg.get("reasoning_content") or msg.get("reasoning") or ""
    text = content or (strip_thinking(reasoning) if re.search(r"판정\s*[:：]", reasoning) else "")
    return text, choice.get("finish_reason") or "", bool(reasoning.strip())


def empty_answer_message(model: str, finish: str, had_reasoning: bool) -> str:
    why = ("토큰 한도에서 잘렸습니다 — 추론 모델이 생각에 토큰을 다 쓴 것 같습니다. NVIDIA_MAX_TOKENS 를 늘리거나 NVIDIA_MODEL 을 일반 instruct 모델로 바꾸세요"
           if finish == "length" else "NVIDIA_MODEL 을 바꿔 보세요 (대시보드의 npm run nvidia:probe 로 되는 모델을 찾을 수 있습니다)")
    return f"NVIDIA 가 빈 답을 보냈습니다 (모델 {model}, finish_reason={finish or '없음'}{', 생각 내용만 있음' if had_reasoning else ''}) — {why}"


def strip_thinking(text: str) -> str:
    """추론 모델이 붙이는 <think>…</think> 를 떼어 낸다."""
    return re.sub(r"<think>.*?</think>", "", text or "", flags=re.S | re.I).strip()


def make_llm(model: Optional[str] = None, timeout: Optional[float] = None, env=None,
             opener: Callable = urllib.request.urlopen) -> Callable[[str], str]:
    """프롬프트 -> 답변 함수를 만든다. 호출할 때마다 환경변수를 읽지 않고 만들 때 한 번만 읽는다."""
    env = os.environ if env is None else env
    keys = api_keys(env)
    endpoint = env.get("NVIDIA_ENDPOINT") or ENDPOINT          # NVIDIA_ENDPOINT 는 테스트용 재정의
    model = model or env.get("NVIDIA_MODEL") or DEFAULT_MODEL
    timeout = timeout or float(env.get("NVIDIA_TIMEOUT_SEC") or 60)
    max_tokens = int(env.get("NVIDIA_MAX_TOKENS") or 2000)
    start = {"i": 0}

    def llm(prompt: str) -> str:
        if not keys:
            raise NvidiaError("NVIDIA_API_KEY 가 설정되지 않았습니다")
        body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}],
                           "temperature": 0.3, "max_tokens": max_tokens, "stream": False}).encode("utf-8")
        last = NvidiaError("NVIDIA 호출 실패")
        for attempt in range(len(keys)):
            key = keys[(start["i"] + attempt) % len(keys)]
            req = urllib.request.Request(endpoint, data=body, method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
            try:
                with opener(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 429):             # 키 한도·인증 문제 -> 다음 키
                    last = NvidiaError(f"NVIDIA HTTP {exc.code} (키 한도·인증)")
                    continue
                raise NvidiaError(f"NVIDIA HTTP {exc.code}") from None
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise NvidiaError(f"NVIDIA 연결 실패: {type(exc).__name__}") from None
            text, finish, had_reasoning = parse_reply(data)
            if not text:
                raise NvidiaError(empty_answer_message(model, finish, had_reasoning))
            start["i"] = (start["i"] + attempt) % len(keys)      # 성공한 키부터 다음에 쓴다
            return text
        raise last

    return llm
