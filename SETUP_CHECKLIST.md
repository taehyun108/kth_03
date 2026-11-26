# 집 PC에서 한 번에 하실 일 (사용자만 할 수 있는 것)

코드는 모두 끝나 있고 `main`에 올라가 있습니다. 아래는 **계정·키·서버 설정처럼 사용자만 할 수 있는 일**입니다.
순서대로 하면 약 **60~75분**입니다. 각 단계 끝에 **성공 기준**이 있으니 그걸 확인하고 넘어가세요.

> 키·비밀번호는 **채팅에 붙여 넣지 마세요.** 아래 정해진 입력 칸에만 넣습니다.

| # | 할 일 | 시간 | 어디서 |
|---|---|---|---|
| 0 | 이 PC의 작업 폴더에 내려받기 | 10분 | 집 PC |
| 1 | 기본 브랜치를 `main`으로 | 2분 | GitHub |
| 2 | Supabase 프로젝트 만들고 SQL 실행 | 10분 | supabase.com |
| 3 | NVIDIA 키 준비 | 5분 | build.nvidia.com |
| 4 | GitHub 시크릿 등록 | 5분 | GitHub |
| 5 | Actions 4개 수동 실행해 확인 | 15분 | GitHub |
| 6 | Vercel에 배포 | 15분 | vercel.com |
| 7 | (선택·지금은 건너뛰어도 됨) 기존 봇 코드 올리기 + 토큰 재발급 | 10분 | 집 PC, 텔레그램 |
| 8 | 저에게 알려 줄 것 | 5분 | Claude |

---

## 0. 이 PC의 작업 폴더에 내려받기 (10분)
작업 폴더: `C:\Users\taehy\OneDrive\바탕 화면\김태현\AWS_AI\증권 분석 앱_KTH03` (기존 봇 폴더 `Economybigin108_Bot`은 그대로 두고, 여기서 새로 이어갑니다.)

먼저 설치돼 있는지 확인합니다. 둘 다 버전이 나오면 됩니다 (Node는 22 이상).
```powershell
git --version; node -v
```
- 없으면 Git은 https://git-scm.com , Node는 https://nodejs.org (LTS)에서 설치하세요.

폴더를 **비어 있게** 만든 뒤 아래로 내려받습니다 (저장소가 공개라 로그인 없이 됩니다).
```powershell
cd "C:\Users\taehy\OneDrive\바탕 화면\김태현\AWS_AI\증권 분석 앱_KTH03"
```
```powershell
git clone https://github.com/taehyun108/kth_03.git .
```
- 폴더가 비어 있지 않다는 오류가 나면: 안의 파일을 다른 곳으로 옮기고 다시 하거나, 상위 폴더에서 `git clone https://github.com/taehyun108/kth_03.git "증권 분석 앱_KTH03"` 를 실행하세요.

웹 화면을 내 PC에서 먼저 띄워 봅니다 (키 없이 견본 데이터로 동작).
```powershell
cd dashboard
```
```powershell
npm install
```
```powershell
npm run dev
```
브라우저에서 http://localhost:3000 이 열리면 성공입니다 (순위, 종목 조회, 시장 토론, 좌측 상단 명언). 끄려면 Ctrl+C.

> ⚠️ **OneDrive 주의**: 이 폴더는 OneDrive(바탕 화면) 안이라 `node_modules`(수천 개 파일)까지 동기화되어 느려질 수 있습니다. OneDrive 설정에서 이 폴더를 **동기화 제외**하거나, `dashboard\node_modules` 만이라도 제외하세요.

그다음 Claude에서 새 세션을 시작하고 폴더를 이 작업 폴더로 고르면, 이어서 같은 프로젝트를 PC에서 직접 작업할 수 있습니다. 이 폴더는 GitHub `kth_03`과 연결돼 있어 푸시하면 같은 저장소에 올라갑니다.

## 1. GitHub: 기본 브랜치를 `main`으로 (2분)
1. https://github.com/taehyun108/kth_03 → **Settings → General → Default branch** → `main` 선택 → Update.
2. (참고) 저장소는 **공개** 상태입니다. 공개로 두는 것을 권장합니다. 비공개로 바꾸면 Actions 사용 시간 한도가 생겨 장중 5분 수집(월 약 1,800회 실행)이 무료 한도를 넘을 수 있습니다 (GitHub 요금 안내에서 확인).

**성공 기준**: 저장소 첫 화면에 `main`이 기본으로 보이고 `dashboard/`, `investors/`, `SETUP_CHECKLIST.md`가 보입니다.

## 2. Supabase (10분)
1. https://supabase.com → **New project**. 지역은 가까운 곳(서울/도쿄), DB 비밀번호는 비밀번호 관리자에 저장.
2. 왼쪽 **SQL Editor → New query** → 저장소의 `dashboard/supabase/schema.sql` **전체**를 붙여 넣고 **Run**.
   - `Success. No rows returned`가 나오면 성공입니다. (여러 번 실행해도 안전합니다.)
3. **Project Settings → API**에서 두 값을 메모장에 임시로 복사합니다.
   - `Project URL` (https://○○○.supabase.co)
   - `service_role` 키 — 서버 전용이라 절대 공개하면 안 됩니다.
   - ⚠️ 새 화면에서 `sb_secret_…` 형식 키만 보이면: 이 형식으로는 제가 검증하지 못했습니다. 인증 오류가 나면 **API Keys의 Legacy 탭**에 있는 `service_role`(`eyJ…`로 시작) 키를 쓰세요.

**성공 기준**: **Table Editor**에 `quotes_latest`, `stock_judgments`, `ai_usage`, `sector_debates` 4개 테이블이 보입니다.

## 3. NVIDIA 키 준비 (5분)
- KTH_01에서 쓰던 키(`KTH_01_NVIDIA_API_KEY`)를 그대로 쓰면 됩니다. GitHub 시크릿은 값을 다시 볼 수 없으니 https://build.nvidia.com 에 로그인해서 **API Keys**에서 확인하세요. 없으면 새로 만드세요.
- 이 키를 아래 **4곳**에 넣게 됩니다: ① GitHub 시크릿(4단계) ② Vercel 환경변수(6단계) ③ Claude 환경 설정(8단계) ④ 집 봇의 `.env`(7단계).

## 4. GitHub 시크릿 등록 (5분)
kth_03 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 2단계의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 2단계의 service_role 키 |
| `NVIDIA_API_KEY` | 3단계의 NVIDIA 키 |
| `NVIDIA_API_KEY_2`, `NVIDIA_API_KEY_3` (선택) | 키가 더 있으면. **밑줄 필수** (`KEY2`는 인식 안 됨) |

(선택) **Variables** 탭: `NVIDIA_MODEL`, `AI_DAILY_CAP`(기본 300), `JUDGE_TOP_N`(기본 20). 비워 두면 기본값입니다.

## 5. Actions 4개를 순서대로 수동 실행 (15분)
kth_03 → **Actions** 탭 → 왼쪽에서 워크플로 선택 → **Run workflow** → `main` → Run. **아래 순서**로, 앞의 것이 초록색이 된 뒤 다음을 실행하세요.

| 순서 | 워크플로 | 성공 기준 (실행 로그의 마지막 부분) |
|---|---|---|
| ① | **Collect quotes** | `수집 161/161종목` 과 `Supabase 업로드 완료 (161행)`. Supabase의 `quotes_latest`에 행이 161개 |
| ② | **Fundamentals cache** | `재무 지표 캐시` … 성공 종목 수가 절반 이상 (야후 접속 시험을 겸합니다. 오래 걸려도 정상) |
| ③ | **Judge top volume stocks** | `거래량 상위 20종목 판단을 시작합니다` … `완료 — 생성 20` |
| ④ | **Sector debates** | `10개 산업 토론을 시작합니다` … `완료 — 생성 10` |

- 주말·장 마감 후에도 **마지막 거래일 데이터**로 동작합니다.
- ①이 `야후에서 한 종목도 받지 못했습니다`로 실패하면 **GitHub 서버에서 야후가 막힌 것**입니다. 제게 알려 주세요(대체 방안이 필요합니다).
- ③④에서 `NVIDIA HTTP 404/410` 또는 `응답하지 못했습니다`가 나오면 **기본 모델이 단종·미배포**일 수 있습니다. 제게 로그를 보여 주시면 다른 모델로 바꿔 드립니다(Variables의 `NVIDIA_MODEL`만 바꾸면 됩니다).
- 이후에는 **평일에 자동으로** 돌아갑니다 (수집 09:00~15:55 5분마다, 재무 캐시 16:05, 판단 16:15, 토론 16:40 — 한국 시간). 자동 실행은 4단계 시크릿이 있어야 합니다.

> 📱 **폰으로도 가능한 단계**: 2(Supabase), 3(NVIDIA 키), 4(GitHub 시크릿), 5(Actions 실행), 6(Vercel)은 모두 휴대폰 브라우저(데스크톱 사이트 보기)에서 할 수 있습니다. PC가 꼭 필요한 건 0단계(로컬 복제)뿐이며, 배포만 할 거라면 건너뛰어도 됩니다.

## 6. Vercel 배포 (15분)
1. https://vercel.com → **Add New → Project** → GitHub의 `taehyun108/kth_03`을 Import (권한 요청이 뜨면 허용).
2. **Root Directory를 `dashboard`로 지정**합니다 (Edit 버튼). Framework는 Next.js로 자동 인식됩니다.
3. **Environment Variables**에 아래를 넣고 **Deploy**.

| 이름 | 값 |
|---|---|
| `DASHBOARD_PASSWORD` | **직접 정하는 접속 비밀번호** (16자 이상 권장, 한글 가능). 비워 두면 접속이 전부 막힙니다(503) |
| `SUPABASE_URL` | 2단계의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 2단계의 service_role 키 |
| `NVIDIA_API_KEY` | 3단계의 NVIDIA 키 |

4. Production 브랜치가 `main`인지 확인합니다 (Vercel 화면 개편으로 위치가 **Settings → Git** 또는 **Settings → Environments → Production**일 수 있습니다).

**성공 기준** (배포된 주소를 열어서):
- [ ] 비밀번호 창이 뜨고, 틀린 비밀번호는 거부됩니다 (아이디는 아무거나).
- [ ] **순위**: "견본 데이터" 배지가 **없고** 거래일이 최근 날짜입니다.
- [ ] **종목 조회**: `삼성전자` → 재무 지표(계산식 포함)와 뉴스가 나오고, **"투자 대가 판단 받기"** 버튼을 누르면 카드 4개가 나옵니다.
- [ ] **시장 토론**: 산업 10개가 성장/보합/침체로 나뉘어 보입니다.
- [ ] **좌측 상단**에 오늘의 명언이 보입니다.

## 7. (선택) 기존 봇 코드 올리기 + 봇 토큰 재발급 (10분)
**지금은 기존 봇 폴더를 건드리지 않기로 했으니 건너뛰어도 됩니다.** 나중에 텔레그램 연동을 할 때 하세요. 다만 이전 세션 기록에 봇 토큰이 노출됐으니 **토큰 재발급(2번)만은 권장**합니다.

1. **코드 올리기** (PowerShell). `.env`가 올라가지 않는지 마지막 줄로 꼭 확인하세요.
```powershell
cd "C:\Users\taehy\OneDrive\바탕 화면\바이브코딩작업실\Economybigin108_Bot"
```
```powershell
Add-Content .gitignore ".env"; git init; git add -A; git commit -m "Economybigin108_Bot 초기 업로드"
```
```powershell
git ls-files | Select-String "\.env"
```
(위 명령은 `.env`가 **나오지 않아야** 합니다. `.env.example` 같은 예시 파일은 나와도 괜찮고, **`.env` 자체가 나오면 중단**하고 알려 주세요.)
```powershell
git branch -M bot-original; git remote add origin https://github.com/taehyun108/kth_03.git; git push -u origin bot-original
```
2. **토큰 재발급**: 텔레그램 @BotFather → `/mybots` → @Economybigin108_bot → **API Token → Revoke current token** → 새 토큰을 `.env`의 `TELEGRAM_BOT_TOKEN`에 교체 → 봇 재시작.
3. **`.env`에 한 줄 추가**: `NVIDIA_API_KEY=3단계의키` (이 값은 파일에만 두고 채팅에 붙이지 마세요).

**성공 기준**: GitHub에 `bot-original` 브랜치가 보이고, 새 토큰으로 봇이 대답합니다.

## 8. 저에게 알려 줄 것 (새 세션에서)
- **"올렸어"** (7단계 완료) → 제가 `main`에 `bot/` 폴더로 합치고 텔레그램 연동(`종목 삼성전자` 등)과 아침 브리핑 연동을 진행합니다.
- **NVIDIA 키를 Claude 환경에 등록**: 세션 제목줄의 클라우드 환경 메뉴 → **Edit → Network secrets**에서 `integrate.api.nvidia.com`용으로 입력 (**kth_03 (Yahoo Finance)** 환경). 새 세션부터 적용되며, 그러면 제가 **실제 모델로 판단·토론을 검증**합니다. (2·3단계는 가짜 AI 서버로만 검증했습니다.)
- **5단계 Actions 결과**: 성공/실패와, 실패했다면 로그 마지막 20줄 (키 값이 보이면 지우고).
- **6단계 결과**: 배포 주소가 열렸는지, 위 체크 항목 중 안 되는 것 (비밀번호는 알려 주지 마세요).
- **강방천 프롬프트**: 있으면 5번째 투자자로 추가합니다 (판단·토론·명언 모두 확장됩니다).

---

## 막혔을 때 (증상 → 원인 → 할 일)
| 증상 | 원인 | 할 일 |
|---|---|---|
| 화면에 "견본 데이터" 배지가 계속 보임 | Vercel의 `SUPABASE_*` 환경변수 누락·오타, 또는 5단계 ① 미실행 | 환경변수 확인 후 **Redeploy**, ① 먼저 실행 |
| "저장소(Supabase)가 연결되지 않아 AI 판단을 쓸 수 없습니다" | Vercel에 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 없음 | 6단계 환경변수 추가 후 Redeploy |
| "재무 데이터를 불러오지 못했습니다" | Vercel 서버에서 야후가 막혔을 수 있음 | 제게 알려 주세요 (대체 방안 필요) |
| "AI 판단을 받지 못했습니다 (NVIDIA HTTP …)" | 키 오류·모델 단종·무료 한도 | 키 확인, `NVIDIA_MODEL` 변경, 로그를 제게 |
| "NVIDIA가 빈 답을 보냈습니다" | 기본 모델이 '생각만 하고 답을 안 주는' 추론 모델 | `dashboard` 폴더에서 `npm run nvidia:probe` → 추천된 `NVIDIA_MODEL=…` 한 줄을 `.env.local`(로컬) / Vercel·GitHub 변수(배포)에 넣기 |
| "오늘 AI 호출 한도를 모두 사용했습니다" | 하루 상한(기본 300회) 도달 | 정상 동작입니다. 내일 다시, 또는 `AI_DAILY_CAP` 조정 |
| 접속이 계속 503 | `DASHBOARD_PASSWORD` 비어 있음 | 6단계 환경변수 추가 후 Redeploy |
| Actions 예약 실행이 안 돎 | 기본 브랜치가 `main`이 아님 (1단계), 또는 시크릿 미등록 (4단계) | 1·4단계 확인 |
| Supabase 호출이 401/403 | 키 형식 문제 (`sb_secret_…`) | 2단계의 ⚠️ 참고: Legacy `service_role` 키 사용 |

## 하기 전에 결정해 두세요
- **공개 범위**: 지금은 접속 비밀번호로 막혀 있습니다. 한국에서는 불특정 다수에게 특정 종목의 매수·매도 의견을 제공하면 **유사투자자문업 신고 등 규제 대상**이 될 수 있다고 알려져 있습니다(법률 자문이 아니니 공개 전에 직접 확인하세요). 확인 전에는 **링크와 비밀번호를 널리 공유하지 마세요.**
- **NVIDIA 무료 한도**: 하루 몇 회까지 무료인지 확인하지 못했습니다. 자동 실행만으로 하루 약 170회를 씁니다. 한도가 작다면 Variables의 `JUDGE_TOP_N`(기본 20)을 줄이세요.

## 제가 이미 해 둔 것 (다시 안 하셔도 됩니다)
- 대시보드 1~4단계(수집·순위, 종목 조회·판단, 시장 토론, 오늘의 명언)와 테스트(웹 73개 + 파이썬 25개), 자동 검사(CI)
- 접속 비밀번호, AI 하루 호출 상한, 다른 사이트의 대리 호출(CSRF) 차단, 보안 헤더
- 봇에 붙일 모듈(`investor_advisor.py`, `nvidia_llm.py`)과 투자자 프롬프트(`investors/*.md`)
- 명언 33개의 원문 대조 (제외한 것과 이유는 `dashboard/README.md`)
