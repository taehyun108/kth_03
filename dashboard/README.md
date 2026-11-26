# Economy Begin 대시보드 (1단계: 수집·순위 / 2단계: 종목 조회·투자자 판단 / 3단계: 시장 토론 / 4단계: 오늘의 명언)

한국 주식(코스피·코스닥 161개 종목)의 **거래량 순위**와 **산업별 거래대금**을 보여 주는 웹 화면입니다.


```
GitHub Actions (장중 5분마다)  →  Supabase(quotes_latest)  →  Vercel(Next.js 화면)
   collector/collect_quotes.py        supabase/schema.sql          app/, lib/
```

## 1. 내 컴퓨터에서 바로 보기 (설정 없이)
```bash
cd dashboard
npm install
npm run dev          # http://localhost:3000
```
Supabase를 연결하지 않으면 `data/snapshot.sample.json`(견본)이 표시되고 화면에 "견본 데이터"라고 나옵니다.
개발 서버에서는 비밀번호 없이 열립니다.

최신 견본으로 바꾸려면 (Python 3.10+):
```bash
pip install -r collector/requirements.txt
python collector/collect_quotes.py --out data/snapshot.sample.json
```

## 2. 실제 운영 설정 (처음 한 번)

### 2-1. Supabase
1. [supabase.com](https://supabase.com) 에서 프로젝트를 만든다.
2. **SQL Editor** 에 `supabase/schema.sql` 내용을 붙여 넣고 Run.
3. **Project Settings → API** 에서 `Project URL` 과 `service_role` 키를 확인한다. (`service_role` 키는 서버 전용입니다. 채팅·코드·브라우저에 노출하지 마세요.)

### 2-2. GitHub Actions 시크릿
저장소 **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 위의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 위의 service_role 키 |

등록한 뒤 **Actions → Collect quotes → Run workflow** 로 한 번 돌려 Supabase에 행이 생기는지 확인한다.
> 예약 실행(5분마다)은 저장소의 **기본 브랜치**에 있는 워크플로만 돈다.

### 2-3. Vercel
1. Vercel에서 이 저장소를 Import 하고 **Root Directory 를 `dashboard`** 로 지정한다.
2. **Settings → Environment Variables** 에 아래 3개를 넣는다.

| 이름 | 값 |
|---|---|
| `DASHBOARD_PASSWORD` | 접속 비밀번호 (직접 정한다. 한글도 가능) |
| `SUPABASE_URL` | 위의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 위의 service_role 키 |

`DASHBOARD_PASSWORD` 가 비어 있으면 운영 환경에서는 **모든 접속을 막습니다(503)**. 비밀번호를 설정하지 않아 공개되는 일이 없게 한 것입니다.
접속하면 브라우저가 비밀번호 창을 띄웁니다 (아이디는 아무거나, 비밀번호만 맞으면 통과).

## 2-4. 2단계 설정: 종목 조회와 투자자 판단
**종목 조회**(`/stock`)는 종목명이나 6자리 코드로 조회하면 ① 재무 지표(계산식 포함) ② 최근 뉴스 제목 ③ 투자 대가의 매수·관망·매도 판단을 보여 줍니다.
재무 지표는 키 없이 바로 동작합니다. **판단은 NVIDIA 키가 있어야** 나옵니다.

| 어디에 | 이름 | 값 |
|---|---|---|
| Vercel 환경변수 | `NVIDIA_API_KEY` (여러 개면 `NVIDIA_API_KEY_2`, `_3` …) | build.nvidia.com 에서 받은 키 |
| Vercel 환경변수 (선택) | `NVIDIA_MODEL`, `AI_DAILY_CAP` | 모델 이름, 하루 호출 상한(기본 300) |
| GitHub 시크릿 | `NVIDIA_API_KEY` (`_2`, `_3` …) | 같은 키 |
| GitHub 변수 (선택) | `NVIDIA_MODEL`, `AI_DAILY_CAP`, `JUDGE_TOP_N` | 비우면 기본값 (상위 20종목) |

Supabase SQL Editor 에서 **`supabase/schema.sql` 을 다시 실행**하세요 (2단계 테이블 `stock_judgments`, `ai_usage` 와 호출 상한 함수가 추가됐습니다. 여러 번 실행해도 안전합니다).

- 판단은 **버튼을 눌렀을 때** 만들고, 같은 날 같은 종목은 저장된 결과를 다시 보여 줍니다 (AI 호출 없음).
- 장 마감 후 거래량 상위 20종목은 **Actions(Judge top volume stocks)가 미리** 만들어 둡니다.
- 하루 호출 상한을 넘으면 화면에 "오늘 AI 호출 한도를 모두 사용했습니다"가 나옵니다.
- **운영(production)에서 Supabase가 없으면 AI 호출을 거부합니다.** 서버 인스턴스마다 카운터가 따로 생겨 상한을 지킬 수 없기 때문입니다.
- 모델이 응답하지 않으면(단종·미배포) `NVIDIA_MODEL` 을 다른 모델 이름으로 바꾸세요. KTH_01 에서 같은 일이 여러 번 있었습니다.

### 투자자 추가·수정
원본은 저장소 루트의 `investors/*.md` 입니다. 파일을 추가하거나 고친 뒤 아래를 실행하고 커밋하세요 (테스트가 둘이 다르면 실패시킵니다).
```bash
npm run sync-investors
```

## 2-5. 3단계 설정: 시장 토론
**시장 토론**(`/debate`)은 산업 10개를 **성장 시장 / 보합 / 침체(수면기)** 로 나눠 보여 줍니다.
1. **1라운드**: 투자 대가가 각자 산업 뉴스(최근 7일)와 오늘 거래 현황(거래대금·비중·평균 등락률·상위 종목)을 보고 판정과 이유를 냅니다.
2. **2라운드**: 서로의 1라운드 의견을 읽고 이름을 들어 반박하거나 동의하고, 필요하면 판정을 바꿉니다(화면에 "↺ 바꿈" 표시).
3. **요약**: 사회자 역할의 AI가 쟁점을 정리합니다. **결론(라벨)은 AI가 아니라 다수결**로 정합니다 (동수면 확신도 합, 그래도 같으면 보합).

- Actions **Sector debates** 가 한국 시간 평일 16:40에 만들고(저장소·키 설정은 2-4와 같은 시크릿 사용), 화면은 산업별 가장 최근 토론을 보여 줍니다. 화면에서 직접 토론을 만드는 버튼은 없습니다 (비용 보호).
- 이 워크플로는 수집기가 올린 시세가 필요합니다(`Collect quotes` 를 먼저 돌려 두세요). 견본 데이터로는 토론을 만들지 않습니다.
- Supabase SQL Editor 에서 **`supabase/schema.sql` 을 다시 실행**하세요 (`sector_debates` 추가).
- **하루 호출 수**: 산업 하나에 투자자 4명이면 `2×4+1 = 9회`, 10개 산업이면 90회입니다. 종목 판단(상위 20종목 × 4회 = 80회)까지 합치면 매일 자동분만 약 170회라서, 직접 조회할 여유를 두려고 `AI_DAILY_CAP` 기본값을 300으로 했습니다. NVIDIA 무료 한도가 이보다 작다면 값을 줄이거나 `JUDGE_TOP_N` 을 줄이세요.
- 기사는 구글 뉴스에서 '○○주' 같은 시장 표현으로 모읍니다 (`lib/sectors.ts`). 산업 전망 식 검색어는 시장조사 보고서 스팸만 나와서 쓰지 않고, 남은 스팸은 필터로 거릅니다. **일부 산업은 업황과 무관한 기사가 섞일 수 있습니다.**

## 2-6. 4단계: 오늘의 명언 (좌측 상단)
하루에 한 명씩 돌아가며 그 투자자의 **관점 한 줄과 명언**(한국어 번역 + 영어 원문 + 출처)을 모든 화면 좌측 상단에 보여 줍니다.
- **돌아가는 규칙**: `날 수 % 투자자 수` 로 그날의 투자자를 정하고, 같은 투자자가 다시 나올 때마다 그의 다음 명언으로 넘어갑니다. 같은 날에는 누가 언제 열어도 같은 결과입니다(한국 날짜 기준). 키·저장소·AI 호출이 필요 없습니다.
- **명언은 33개** (버핏 9, 멍거 8, 그레이엄 8, 린치 8). `data/quotes.json` 에 있습니다. 강방천은 프롬프트가 아직 없어 빠져 있고, 투자자를 추가하면 명언도 같은 형식으로 추가하세요(명언이 없는 투자자는 자동으로 건너뜁니다).
- **확인 원칙**: 출처에서 **문장이 그대로 나오는 것만** 넣었습니다. 명언 모음 사이트(Goodreads·인스타그램 등)는 근거로 쓰지 않았습니다.

| 확인 방법 | 개수 | 뜻 |
|---|---|---|
| 원문 문자열 대조 | 31 | 원문 전체를 받아 문장이 그대로 있는지 확인 (그중 2개는 PDF라 `manualOnly` — 직접 열어 확인) |
| 책 스캔 검색 발췌 | 2 | 대출 전용 스캔이라 전체를 못 받고 Internet Archive 전문 검색 발췌로 확인 (화면에 '발췌 확인'으로 표시) |

- **다시 확인하는 법**: 화면의 "영어 원문 · 출처"에서 출처 링크를 열고, `quotes.json` 의 `verification.checks` 문구를 Ctrl+F 로 찾으면 됩니다. 한국어는 번역이라 원문과 함께 보여 줍니다.
- **출처가 투자자 본인이 아닌 경우**는 `note` 에 적었습니다 (예: 그레이엄의 "투표 기계/저울", "가격은 내가 내는 것"은 버핏이 서한에서 그레이엄의 말로 인용한 것, 린치의 "경쟁은 인간의 부에 해로울 수 있다"는 버핏이 린치의 말로 인용한 것).
- **제외한 명언** (원문에서 확인하지 못했거나 출처가 엇갈려서):
  - 버핏 "백미러가 앞유리보다 항상 선명하다" — 1992년 서한에서 찾지 못함
  - 멍거 "큰돈은 사고파는 데가 아니라 기다리는 데 있다" — 책마다 제시 리버모어의 말, 멍거의 말로 엇갈림
  - 멍거 "꾸준히 어리석지 않으려 노력해서…" — 2차 자료(2015년 정리본)에서만 확인됨
  - 그레이엄 "군중이 반대한다고 틀린 것도 옳은 것도 아니다" — 그레이엄의 말인지 버핏의 말인지 출처가 엇갈림
  - 그레이엄 "지혜로운 투자자는 낙관론자에게 팔고 비관론자에게서 산다" — 그레이엄 본문이 아니라 책 앞부분 편집자 요약글에 나옴
  - 린치 "Know what you own, and know why you own it", "Invest in what you know" — 그의 책 원문과 도서 검색에서 찾지 못하고 명언 모음 사이트에만 있음
- 새 명언을 넣을 때는 위 기준(원문에서 문장 확인)을 지키고, `lib/quotes.test.ts` 가 형식(출처 https, 확인 방법, 다시 찾을 문구)을 검사합니다.

## 3. 구성
| 경로 | 역할 |
|---|---|
| `data/universe.json` | 종목 목록 + 산업 분류 (161개, 야후에서 조회됨을 확인) |
| `collector/collect_quotes.py` | 야후에서 시세·거래량을 받아 Supabase에 올림 |
| `supabase/schema.sql` | 테이블·인덱스·RLS(정책 없음 = 서비스 롤만 접근) |
| `lib/data.ts` | 화면용 데이터 읽기 (Supabase → 실패 시 견본) |
| `lib/rank.ts` | 거래량 순위, 산업별 거래대금 계산 |
| `lib/yahoo.ts`, `lib/fundamentals.ts` | 야후 재무제표 → 지표·계산식 (PER·PBR·ROE·부채비율 등) |
| `lib/news.ts` | 구글 뉴스 RSS → 제목·출처·링크 |
| `lib/judge.ts`, `lib/nvidia.ts` | 투자자 프롬프트 조립, NVIDIA 호출, 답변 해석 |
| `lib/pipeline.ts`, `lib/store.ts` | 판단 생성·저장, 하루 호출 상한 |
| `app/api/judge/route.ts` | 판단 요청 API (접속 비밀번호로 보호) |
| `scripts/precompute-judgments.ts` | 장 마감 후 상위 종목 판단 미리 만들기 |
| `lib/debate.ts`, `lib/debatePipeline.ts`, `lib/sectors.ts` | 산업별 토론(프롬프트·답변 해석·다수결), 진행, 검색어 |
| `scripts/precompute-debates.ts` | 장 마감 후 산업별 토론 만들기 |
| `data/quotes.json`, `lib/quotes.ts`, `components/QuoteSlot.tsx` | 오늘의 명언 데이터, 하루 한 명 돌리는 규칙, 좌측 상단 표시 |
| `middleware.ts` | 접속 비밀번호 |

## 4. 알아 둘 점
- 야후 한국 시세는 몇 분 지연될 수 있습니다. 거래대금은 `종가 × 거래량`으로 추정한 값입니다.
- 클라우드 서버에서 야후가 접속을 막으면 수집이 실패합니다 (수집 비율이 50% 미만이면 Actions가 실패로 표시).
- 종목 목록은 직접 관리합니다. 상장폐지·합병 종목은 `data/universe.json` 에서 빼 주세요.
- 재무 지표는 **최근 결산(연간)** 기준이고 PER·PBR은 시가총액으로 계산합니다. 금융업은 부채비율 등이 일반 기업과 비교되지 않아 주의 문구가 붙습니다.
- 목록 밖 종목은 야후가 영문 이름만 줘서 뉴스 검색이 덜 정확할 수 있습니다.
- 뉴스는 제목·출처·링크만 보여 줍니다 (한 줄 요약은 아직 없음).
- 이 화면은 참고용이며 투자 권유가 아닙니다.

## 5. 테스트
```bash
npm run typecheck && npm test            # 화면 로직
python -m pytest collector               # 수집기 (pip install pytest pandas)
```
