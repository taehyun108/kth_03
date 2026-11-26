"""투자자 관점별 종목 의견 — 텔레그램 `종목 삼성전자` / `종목 반도체` 처리 모듈.

기존 봇 코드(main.py, chat_handler.py)와 독립적으로 동작한다. 봇이 이미 쓰는 LLM 호출
함수(프롬프트 문자열 -> 답변 문자열)를 `llm` 으로 넘기기만 하면 된다.

    from investor_advisor import parse_stock_command, run_stock_command, ddgs_context

    query = parse_stock_command(text)              # "종목 삼성전자" -> "삼성전자"
    if query:
        replies = run_stock_command(query, llm, ddgs_context)
        # replies 는 텔레그램 글자 수 제한에 맞게 나뉜 메시지 목록

동작
  · 종목명(삼성전자)  -> 그 종목 하나를 분석
  · 업종·테마(반도체) -> 대표 종목 몇 개(기본 3개)를 골라 각각 분석
  · investors/*.md 에 있는 투자자 전원이 각자의 프롬프트로 의견을 낸다.
    새 투자자는 파일 하나만 추가하면 코드 수정 없이 포함된다.
"""
from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

LLM = Callable[[str], str]            # 프롬프트 -> 답변
ContextFn = Callable[[str], str]      # 종목명 -> 참고 자료(검색 요약 등)

INVESTORS_DIR = Path(__file__).parent / "investors"
MAX_SECTOR_TARGETS = 3     # 업종 질문 때 분석할 종목 수 (투자자 수 x 이 값 = LLM 호출 수)
MAX_WORKERS = 4            # 동시에 보낼 LLM 호출 수
TELEGRAM_LIMIT = 4000      # 텔레그램 메시지 한도(4096) 보다 조금 작게
KST = timezone(timedelta(hours=9))

DISCLAIMER = ("⚠️ AI가 공개된 정보로 정리한 참고용 의견이며 투자 권유가 아닙니다. "
              "투자 판단과 책임은 본인에게 있습니다.")

VERDICTS = ("사자", "팔자", "중립")
VERDICT_ICON = {"사자": "🟢", "팔자": "🔴", "중립": "🟡", "판단불가": "⚪"}

# 사용자가 쓴 프롬프트는 그대로 두고, 답을 읽어 모으기 위한 형식 규칙만 뒤에 붙인다.
ANSWER_RULES = """
[답변 규칙]
- 아래 [참고 자료]가 있으면 그것을 우선 근거로 쓰고, 자료에 없거나 확실하지 않은 수치는
  지어내지 말고 '확인 필요'라고 적어줘.
- 마지막은 반드시 아래 형식으로만 끝내줘.
판정: 사자 / 팔자 / 중립 중 하나
확신도: 0~100 사이 숫자
이유:
1. (한 줄)
2. (한 줄)
3. (한 줄)
"""

_COMMAND = re.compile(r"^/?종목\s+(.+)$", re.S)


# ── 명령 해석 ────────────────────────────────────────────────────────────────
def parse_stock_command(text: Optional[str]) -> Optional[str]:
    """'종목 삼성전자' 또는 '/종목 반도체' -> '삼성전자' / '반도체'. 해당 없으면 None."""
    m = _COMMAND.match((text or "").strip())
    if not m:
        return None
    query = m.group(1).strip()
    return query or None


# ── 투자자 프롬프트 ──────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Investor:
    key: str        # 파일 이름에서 번호를 뺀 값 (warren_buffett)
    name: str       # 첫 줄 '# 워런 버핏'
    template: str   # [종목] 자리표시자가 들어 있는 프롬프트 본문


def load_investors(directory: Path = INVESTORS_DIR) -> list[Investor]:
    """investors/*.md 를 파일 이름 순으로 읽는다. 첫 줄 '# 이름', 나머지가 프롬프트."""
    investors: list[Investor] = []
    for path in sorted(Path(directory).glob("*.md")):
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        if len(lines) < 2 or not lines[0].startswith("#"):
            logger.warning("투자자 파일 형식 오류(첫 줄이 '# 이름' 이어야 함): %s", path.name)
            continue
        template = "\n".join(lines[1:]).strip()
        if "[종목]" not in template:
            logger.warning("투자자 파일에 [종목] 이 없어 건너뜀: %s", path.name)
            continue
        key = re.sub(r"^\d+_", "", path.stem)
        investors.append(Investor(key=key, name=lines[0].lstrip("# ").strip(), template=template))
    return investors


def build_prompt(investor: Investor, target: str, context: str = "") -> str:
    today = datetime.now(KST).strftime("%Y-%m-%d")
    parts = [investor.template.replace("[종목]", target), f"\n오늘 날짜: {today} (한국 시간)"]
    if context.strip():
        parts.append(f"\n[참고 자료]\n{context.strip()}")
    parts.append(ANSWER_RULES)
    return "\n".join(parts)


# ── 종목 / 업종 구분 ─────────────────────────────────────────────────────────
def resolve_targets(query: str, llm: LLM, max_targets: int = MAX_SECTOR_TARGETS) -> list[str]:
    """종목명이면 [그 종목], 업종·테마면 대표 종목 목록. 실패하면 질문 그대로 한 종목으로 본다."""
    prompt = (
        f"사용자가 '종목 {query}' 라고 물었어. 이게 개별 회사(또는 티커)인지, 업종·테마인지 구분해줘.\n"
        f"- 개별 회사면 type=stock, targets 에는 그 회사의 정식 이름 1개.\n"
        f"- 업종·테마면 type=sector, targets 에는 대표적인 상장 종목 {max_targets}개 "
        f"(국내 시가총액 상위 위주, 해외 업종이면 그쪽 대표 종목).\n"
        f'JSON 한 줄로만 답해: {{"type": "stock 또는 sector", "targets": ["이름", ...]}}'
    )
    try:
        raw = llm(prompt)
        match = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(match.group(0)) if match else {}
        targets = [str(t).strip() for t in data.get("targets", []) if str(t).strip()]
    except Exception:
        logger.warning("종목/업종 구분 실패 — 질문을 그대로 종목으로 처리", exc_info=True)
        targets = []
    if not targets:
        return [query]
    unique = list(dict.fromkeys(targets))          # 중복 제거, 순서 유지
    return unique[:max_targets] if len(unique) > 1 else unique


# ── 의견 해석 ────────────────────────────────────────────────────────────────
@dataclass
class Opinion:
    investor: str
    verdict: str = "판단불가"          # 사자 / 팔자 / 중립 / 판단불가
    confidence: Optional[int] = None
    reasons: list[str] = field(default_factory=list)
    error: str = ""


def parse_opinion(investor: str, text: str) -> Opinion:
    """모델 답변에서 판정·확신도·이유를 읽는다. 형식이 어긋나면 '판단불가'로 둔다."""
    clean = (text or "").replace("**", "").replace("__", "")
    verdicts = re.findall(r"판정\s*[:：]\s*\[?\s*(사자|팔자|중립)", clean)
    confs = re.findall(r"확신도\s*[:：]\s*\[?\s*(\d{1,3})", clean)
    reasons: list[str] = []
    tail = re.split(r"이유\s*[:：]", clean)[-1] if re.search(r"이유\s*[:：]", clean) else ""
    for line in tail.splitlines():
        m = re.match(r"\s*(?:\d+[.)]|[-•])\s*(.+)", line)
        if m:
            reasons.append(m.group(1).strip())
    if not verdicts:
        return Opinion(investor=investor, error="판정을 읽지 못함", reasons=reasons[:3])
    return Opinion(
        investor=investor,
        verdict=verdicts[-1],
        confidence=min(int(confs[-1]), 100) if confs else None,
        reasons=reasons[:3],
    )


def analyze_target(target: str, llm: LLM, investors: list[Investor],
                   context_fn: Optional[ContextFn] = None) -> list[Opinion]:
    """한 종목에 대해 투자자 전원의 의견을 모은다. 한 명이 실패해도 나머지는 계속된다."""
    context = ""
    if context_fn:
        try:
            context = context_fn(target)
        except Exception:
            logger.warning("참고 자료 수집 실패: %s", target, exc_info=True)

    def ask(inv: Investor) -> Opinion:
        try:
            return parse_opinion(inv.name, llm(build_prompt(inv, target, context)))
        except Exception as exc:
            logger.warning("%s 의견 생성 실패", inv.name, exc_info=True)
            return Opinion(investor=inv.name, error=f"{type(exc).__name__}")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        return list(pool.map(ask, investors))


# ── 메시지 만들기 ────────────────────────────────────────────────────────────
def format_target(target: str, opinions: list[Opinion]) -> str:
    counts = {v: sum(1 for o in opinions if o.verdict == v) for v in VERDICTS}
    summary = " · ".join(f"{VERDICT_ICON[v]} {v} {n}" for v, n in counts.items() if n)
    lines = [f"📊 {target} — 투자자 {len(opinions)}인 의견", summary or "의견을 모으지 못했어요", ""]
    for o in opinions:
        conf = f" (확신 {o.confidence})" if o.confidence is not None else ""
        lines.append(f"{VERDICT_ICON.get(o.verdict, '⚪')} {o.investor} — {o.verdict}{conf}")
        if o.error and not o.reasons:
            lines.append(f"   ※ {o.error}")
        for i, reason in enumerate(o.reasons, 1):
            lines.append(f"   {i}. {reason}")
        lines.append("")
    return "\n".join(lines).rstrip()


def split_message(text: str, limit: int = TELEGRAM_LIMIT) -> list[str]:
    """텔레그램 글자 수 제한에 맞게 줄 단위로 나눈다."""
    chunks, current = [], ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:                         # 한 줄이 한도보다 긴 예외 상황
            if current:
                chunks.append(current.rstrip()); current = ""
            chunks.append(line[:limit]); line = line[limit:]
        if len(current) + len(line) > limit:
            chunks.append(current.rstrip()); current = ""
        current += line
    if current.strip():
        chunks.append(current.rstrip())
    return chunks


def run_stock_command(query: str, llm: LLM, context_fn: Optional[ContextFn] = None,
                      investors: Optional[list[Investor]] = None,
                      max_targets: int = MAX_SECTOR_TARGETS) -> list[str]:
    """`종목 <query>` 전체 처리. 텔레그램에 순서대로 보낼 메시지 목록을 돌려준다."""
    investors = investors if investors is not None else load_investors()
    if not investors:
        return ["투자자 프롬프트(investors/*.md)를 찾지 못했어요."]
    targets = resolve_targets(query, llm, max_targets)
    sections = []
    if len(targets) > 1 or targets[0] != query:
        sections.append(f"🏷 '{query}' 관련 종목: {', '.join(targets)}\n")
    for target in targets:
        sections.append(format_target(target, analyze_target(target, llm, investors, context_fn)))
    sections.append(DISCLAIMER)
    return split_message("\n\n".join(sections))


# ── 참고 자료(선택) ──────────────────────────────────────────────────────────
def ddgs_context(target: str, max_results: int = 5) -> str:
    """봇이 이미 쓰는 ddgs 로 최근 검색 요약을 모은다. 설치돼 있지 않거나 실패하면 빈 문자열."""
    try:
        from ddgs import DDGS
        hits = DDGS().text(f"{target} 주가 실적 PER PBR 전망", max_results=max_results) or []
    except Exception:
        logger.warning("검색 실패: %s", target, exc_info=True)
        return ""
    return "\n".join(f"- {h.get('title', '')}: {h.get('body', '')}" for h in hits)
