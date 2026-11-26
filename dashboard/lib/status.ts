import { nvidiaKeys, nvidiaModel } from "./nvidia";
import { DAILY_CAP, hasSupabase, overview, type Overview } from "./store";
import { UNIVERSE } from "./universe";
import { kstDay } from "./judge";

export type Level = "ok" | "warn" | "bad";
export type Check = { id: string; title: string; level: Level; detail: string; fix?: string };

export type StatusInput = {
  production: boolean;
  passwordSet: boolean;
  nvidiaKeys: number;
  model: string;
  modelDefault: boolean;
  cap: number;
  supabase: boolean;
  overview: Overview | null;
  overviewError: string | null;
  universe: number;
  now: Date;
};

const hoursAgo = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 3_600_000;

/** 설정·데이터 상태를 항목별로 판정한다(순수 함수 — 테스트 가능). */
export function buildChecks(s: StatusInput): Check[] {
  const c: Check[] = [];
  c.push(
    s.passwordSet
      ? { id: "password", title: "접속 비밀번호", level: "ok", detail: "DASHBOARD_PASSWORD 가 설정되어 있습니다." }
      : { id: "password", title: "접속 비밀번호", level: s.production ? "bad" : "warn", detail: "DASHBOARD_PASSWORD 가 없습니다.", fix: "Vercel 환경변수에 DASHBOARD_PASSWORD 를 넣고 다시 배포하세요." },
  );
  c.push(
    s.nvidiaKeys > 0
      ? { id: "nvidia", title: "NVIDIA 키", level: "ok", detail: `키 ${s.nvidiaKeys}개 · 모델 ${s.model}${s.modelDefault ? " (기본값)" : ""}` }
      : { id: "nvidia", title: "NVIDIA 키", level: "bad", detail: "NVIDIA_API_KEY 가 없습니다. AI 판단·토론이 동작하지 않습니다.", fix: "Vercel 환경변수 NVIDIA_API_KEY 를 추가하세요." },
  );
  if (!s.supabase) {
    c.push({ id: "supabase", title: "저장소(Supabase)", level: s.production ? "bad" : "warn", detail: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 견본 데이터만 보이고 AI 판단은 거부됩니다.", fix: "Vercel 환경변수에 두 값을 넣으세요." });
    return c;
  }
  if (s.overviewError || !s.overview) {
    c.push({ id: "supabase", title: "저장소(Supabase)", level: "bad", detail: `연결은 설정됐지만 읽기에 실패했습니다: ${s.overviewError ?? "알 수 없음"}`, fix: "Supabase SQL Editor 에서 supabase/schema.sql 전체를 실행했는지, 키가 service_role(secret) 키인지 확인하세요." });
    return c;
  }
  const o = s.overview;
  c.push({ id: "supabase", title: "저장소(Supabase)", level: "ok", detail: "연결과 테이블 읽기가 정상입니다." });

  if (o.quotes.count === 0 || !o.quotes.latest) {
    c.push({ id: "quotes", title: "시세 수집", level: "bad", detail: "저장된 시세가 없습니다.", fix: "GitHub Actions 에서 Collect quotes 를 Run workflow 로 실행하세요." });
  } else {
    const age = hoursAgo(o.quotes.latest, s.now);
    const ageText = age < 1 ? `${Math.round(age * 60)}분 전` : age < 48 ? `${Math.round(age)}시간 전` : `${Math.round(age / 24)}일 전`;
    c.push({
      id: "quotes", title: "시세 수집", level: o.quotes.count < s.universe * 0.8 ? "warn" : "ok",
      detail: `${o.quotes.count}/${s.universe}종목 · 마지막 수집 ${ageText} (장 마감 후·주말에는 오래된 게 정상)`,
      fix: o.quotes.count < s.universe * 0.8 ? "일부 종목 수집이 실패했습니다. Actions 로그에서 Collect quotes 를 확인하세요." : undefined,
    });
  }
  c.push(
    o.fundamentalsCount === 0
      ? { id: "fundamentals", title: "재무 지표 캐시", level: "warn", detail: "저장된 지표가 없어 종목 조회 때마다 야후에 직접 접속합니다.", fix: "Actions 의 Fundamentals cache 를 실행하세요." }
      : { id: "fundamentals", title: "재무 지표 캐시", level: o.fundamentalsCount < s.universe * 0.8 ? "warn" : "ok", detail: `${o.fundamentalsCount}/${s.universe}종목 저장됨` },
  );
  c.push(
    o.judgmentsToday === 0
      ? { id: "judgments", title: "오늘의 판단", level: "warn", detail: "오늘 저장된 판단이 없습니다(장 마감 후 자동 생성, 또는 종목 조회 때 생성).", fix: "급하면 Actions 의 Judge top volume stocks 를 실행하세요." }
      : { id: "judgments", title: "오늘의 판단", level: "ok", detail: `${o.judgmentsToday}종목` },
  );
  c.push(
    o.debates.latestDay
      ? { id: "debates", title: "산업 토론", level: "ok", detail: `최근 ${o.debates.latestDay} · ${o.debates.count}개 산업` }
      : { id: "debates", title: "산업 토론", level: "warn", detail: "저장된 토론이 없습니다.", fix: "Actions 의 Sector debates 를 실행하세요." },
  );
  const pct = s.cap > 0 ? o.aiCallsToday / s.cap : 0;
  c.push({ id: "cap", title: "오늘 AI 호출", level: pct >= 1 ? "bad" : pct >= 0.8 ? "warn" : "ok", detail: `${o.aiCallsToday}/${s.cap}회 사용` });
  return c;
}

export async function collectStatus(now: Date = new Date()): Promise<Check[]> {
  let ov: Overview | null = null;
  let err: string | null = null;
  if (hasSupabase()) {
    try {
      ov = await overview(kstDay(now));
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  return buildChecks({
    production: process.env.NODE_ENV === "production",
    passwordSet: Boolean(process.env.DASHBOARD_PASSWORD),
    nvidiaKeys: nvidiaKeys().length,
    model: nvidiaModel(),
    modelDefault: !process.env.NVIDIA_MODEL,
    cap: DAILY_CAP(),
    supabase: hasSupabase(),
    overview: ov,
    overviewError: err,
    universe: UNIVERSE.length,
    now,
  });
}
