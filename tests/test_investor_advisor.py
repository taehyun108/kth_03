import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import investor_advisor as ia

GOOD = "분석 …\n판정: 사자\n확신도: 82\n이유:\n1. 해자가 넓다\n2. 현금흐름이 좋다\n3. 가격이 적당하다"


def fake_llm(prompt: str) -> str:
    if "JSON 한 줄로만" in prompt:
        if "반도체" in prompt:
            return '```json\n{"type": "sector", "targets": ["삼성전자", "SK하이닉스", "한미반도체", "DB하이텍"]}\n```'
        return '{"type": "stock", "targets": ["삼성전자"]}'
    return GOOD


def test_command_parsing():
    assert ia.parse_stock_command("종목 삼성전자") == "삼성전자"
    assert ia.parse_stock_command("/종목 반도체 ") == "반도체"
    assert ia.parse_stock_command("종목") is None
    assert ia.parse_stock_command("오늘 날씨") is None
    assert ia.parse_stock_command(None) is None


def test_four_investors_loaded_in_order():
    invs = ia.load_investors()
    assert [i.name for i in invs] == ["워런 버핏", "찰리 멍거", "벤저민 그레이엄", "피터 린치"]
    assert all("[종목]" in i.template for i in invs)


def test_prompt_keeps_user_text_and_adds_rules():
    inv = ia.load_investors()[0]
    p = ia.build_prompt(inv, "삼성전자", "- 기사 하나")
    assert "지금 고민 중인 종목은 삼성전자이야" in p
    assert "해자(자기자본이익률·이익률·가격 결정력)" in p
    assert "[참고 자료]" in p and "판정:" in p and "[종목]" not in p


def test_parse_opinion_variants():
    o = ia.parse_opinion("버핏", "**판정:** 중립\n**확신도:** 55\n이유:\n- 가\n- 나\n- 다")
    assert (o.verdict, o.confidence, o.reasons) == ("중립", 55, ["가", "나", "다"])
    assert ia.parse_opinion("x", "모르겠어요").verdict == "판단불가"
    assert ia.parse_opinion("x", "판정: 사자\n확신도: 250").confidence == 100


def test_single_stock_flow():
    replies = ia.run_stock_command("삼성전자", fake_llm)
    text = "\n".join(replies)
    assert "삼성전자 — 투자자 4인 의견" in text and "🟢 사자 4" in text
    for name in ("워런 버핏", "찰리 멍거", "벤저민 그레이엄", "피터 린치"):
        assert name in text
    assert "투자 권유가 아닙니다" in text
    assert all(len(r) <= ia.TELEGRAM_LIMIT for r in replies)


def test_sector_flow_caps_targets():
    text = "\n".join(ia.run_stock_command("반도체", fake_llm))
    assert "SK하이닉스" in text and "한미반도체" in text
    assert "DB하이텍" not in text          # 기본 3개까지만
    assert text.count("투자자 4인 의견") == 3


def test_resolve_falls_back_on_garbage():
    assert ia.resolve_targets("삼전", lambda p: "죄송합니다") == ["삼전"]


def test_one_investor_failure_does_not_stop_others():
    calls = {"n": 0}

    def flaky(prompt):
        if "JSON 한 줄로만" in prompt:
            return '{"type":"stock","targets":["삼성전자"]}'
        calls["n"] += 1
        if "찰리 멍거" in prompt:
            raise RuntimeError("quota")
        return GOOD

    text = "\n".join(ia.run_stock_command("삼성전자", flaky))
    assert "🟢 사자 3" in text and "찰리 멍거 — 판단불가" in text


def test_split_message_respects_limit():
    long = "\n".join("가" * 90 for _ in range(200))
    parts = ia.split_message(long, 1000)
    assert len(parts) > 1 and all(len(p) <= 1000 for p in parts)
    assert "".join(p.replace("\n", "") for p in parts) == long.replace("\n", "")
