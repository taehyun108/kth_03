# Economybigin108_Bot — 투자자 관점 종목 의견

텔레그램에서 `종목 삼성전자` 또는 `종목 반도체` 를 보내면, 등록된 투자자 전원의 관점으로
사자·팔자·중립 판정과 확신도(0~100), 이유 3줄을 보내 줍니다.

- `종목 삼성전자` → 그 종목 하나를 분석
- `종목 반도체` → 대표 종목 3개(삼성전자, SK하이닉스 등)를 골라 각각 분석

## 투자자 추가·수정
`investors/` 폴더에 파일 하나가 투자자 한 명입니다. **파일만 추가하면 코드 수정 없이 반영됩니다.**

```
investors/05_이름.md
  # 투자자 이름              <- 첫 줄은 반드시 '# 이름'
  너는 ○○의 투자 원칙으로 종목을 보는 분석가야
  지금 고민 중인 종목은 [종목]이야   <- [종목] 자리에 종목명이 들어갑니다
  - ...
```
판정·확신도·이유 3줄 형식은 코드가 뒤에 붙여 주므로 프롬프트에 또 적지 않아도 됩니다.
현재: 워런 버핏 · 찰리 멍거 · 벤저민 그레이엄 · 피터 린치

## 봇에 연결하기 (main.py 의 메시지 처리 부분)
`investor_advisor.py` 는 기존 코드와 독립적입니다. 봇이 이미 쓰는 LLM 호출 함수
(프롬프트 문자열 → 답변 문자열)를 `llm` 으로 넘기면 됩니다.

```python
import asyncio
from investor_advisor import parse_stock_command, run_stock_command, ddgs_context

query = parse_stock_command(text)          # '종목 삼성전자' 또는 '/종목 삼성전자'
if query:
    await update.message.reply_text("🔎 투자자들의 의견을 모으는 중이에요… (30초~1분)")
    replies = await asyncio.to_thread(run_stock_command, query, llm_call, ddgs_context)
    for reply in replies:
        await update.message.reply_text(reply)
    return
```

## 설정값 (`investor_advisor.py` 위쪽)
| 이름 | 기본 | 뜻 |
|---|---|---|
| `MAX_SECTOR_TARGETS` | 3 | 업종 질문 때 분석할 종목 수. LLM 호출 수 = 투자자 수 × 이 값 |
| `MAX_WORKERS` | 4 | 동시에 보내는 LLM 호출 수. 무료 API 한도에 걸리면 줄이세요 |

## 테스트
```
pip install pytest
python -m pytest -q
```

## 주의
- `.env`(봇 토큰, API 키)는 절대 올리지 마세요. `.gitignore` 에 제외돼 있습니다.
- 답변은 AI가 정리한 참고용이며 투자 권유가 아닙니다. 모든 답변 끝에 안내 문구가 붙습니다.
