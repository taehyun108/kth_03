-- 순위용 최신 시세 테이블. Supabase 대시보드 > SQL Editor 에 붙여 넣어 한 번 실행한다.
-- 수집기(GitHub Actions)가 5분마다 종목당 1행을 덮어쓴다(upsert).

create table if not exists quotes_latest (
  code           text primary key,                 -- 6자리 종목 코드
  name           text not null,
  market         text not null check (market in ('KOSPI', 'KOSDAQ')),
  sector         text not null,
  price          numeric(14, 2) not null,
  prev_close     numeric(14, 2),
  change_pct     numeric(8, 2),
  volume         bigint not null check (volume >= 0),
  trading_value  bigint not null check (trading_value >= 0),   -- 종가 x 거래량으로 추정
  bar_date       date not null,                    -- 시세가 속한 거래일
  updated_at     timestamptz not null              -- 수집 시각
);

-- 순위 화면: 전체 거래량 순, 산업별 거래량 순
create index if not exists quotes_latest_volume_idx on quotes_latest (volume desc);
create index if not exists quotes_latest_sector_volume_idx on quotes_latest (sector, volume desc);

-- RLS 를 켜고 정책을 만들지 않는다 = anon/authenticated 키로는 읽기·쓰기 모두 거부.
-- 수집기와 웹 서버는 서비스 롤 키(RLS 우회)로만 접근하며, 이 키는 브라우저로 내려보내지 않는다.
alter table quotes_latest enable row level security;
alter table quotes_latest force row level security;

-- ── 2단계: 투자자 판단 저장과 하루 AI 호출 상한 ──────────────────────────
-- 종목·날짜(한국 기준)마다 판단 1개를 저장한다. 같은 날 다시 조회하면 AI 를 부르지 않고 이 값을 보여 준다.
create table if not exists stock_judgments (
  code        text not null,
  day         date not null,
  payload     jsonb not null,                       -- 투자자별 판정·확신도·이유
  created_at  timestamptz not null default now(),
  primary key (code, day)
);

-- 하루 AI 호출 횟수. consume_ai_calls 가 상한을 넘지 않을 때만 올리고, 음수 n 으로 반납한다(원자적).
create table if not exists ai_usage (
  day    date primary key,
  calls  integer not null default 0 check (calls >= 0)
);

create or replace function consume_ai_calls(p_day date, p_n integer, p_cap integer)
returns boolean
language plpgsql
as $$
begin
  insert into ai_usage (day, calls) values (p_day, 0) on conflict (day) do nothing;
  update ai_usage set calls = calls + p_n
   where day = p_day and calls + p_n <= p_cap and calls + p_n >= 0;
  return found;
end;
$$;

alter table stock_judgments enable row level security;
alter table stock_judgments force row level security;
alter table ai_usage enable row level security;
alter table ai_usage force row level security;

-- 함수는 기본적으로 anon 키로도 호출할 수 있으므로 막는다. 서비스 롤(서버·Actions)만 쓴다.
revoke all on function consume_ai_calls(date, integer, integer) from public, anon, authenticated;
