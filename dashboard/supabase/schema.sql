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
