# Economy Begin 대시보드 (1단계: 수집·순위 / 2단계: 종목 조회·투자자 판단)

한국 주식(코스피·코스닥 161개 종목)의 **거래량 순위**와 **산업별 거래대금**을 보여 주는 웹 화면입니다.
3단계(시장 토론)는 아직 자리만 있습니다. 좌측 상단 '오늘의 명언'은 4단계에서 채웁니다.

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
| Vercel 환경변수 (선택) | `NVIDIA_MODEL`, `AI_DAILY_CAP` | 모델 이름, 하루 호출 상한(기본 200) |
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
