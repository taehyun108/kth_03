# Economy Begin 대시보드 (1단계: 수집 + 거래량 순위)

한국 주식(코스피·코스닥 161개 종목)의 **거래량 순위**와 **산업별 거래대금**을 보여 주는 웹 화면입니다.
2단계(종목 조회·5인 판단), 3단계(시장 토론)는 아직 자리만 있습니다. 좌측 상단 '오늘의 명언'은 4단계에서 채웁니다.

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

## 3. 구성
| 경로 | 역할 |
|---|---|
| `data/universe.json` | 종목 목록 + 산업 분류 (161개, 야후에서 조회됨을 확인) |
| `collector/collect_quotes.py` | 야후에서 시세·거래량을 받아 Supabase에 올림 |
| `supabase/schema.sql` | 테이블·인덱스·RLS(정책 없음 = 서비스 롤만 접근) |
| `lib/data.ts` | 화면용 데이터 읽기 (Supabase → 실패 시 견본) |
| `lib/rank.ts` | 거래량 순위, 산업별 거래대금 계산 |
| `middleware.ts` | 접속 비밀번호 |

## 4. 알아 둘 점
- 야후 한국 시세는 몇 분 지연될 수 있습니다. 거래대금은 `종가 × 거래량`으로 추정한 값입니다.
- 클라우드 서버에서 야후가 접속을 막으면 수집이 실패합니다 (수집 비율이 50% 미만이면 Actions가 실패로 표시).
- 종목 목록은 직접 관리합니다. 상장폐지·합병 종목은 `data/universe.json` 에서 빼 주세요.
- 이 화면은 참고용이며 투자 권유가 아닙니다.

## 5. 테스트
```bash
npm run typecheck && npm test            # 화면 로직
python -m pytest collector               # 수집기 (pip install pytest pandas)
```
