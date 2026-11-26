import type { Debate } from "./debate";
import type { Judgment } from "./judge";

/**
 * 판단 저장과 하루 AI 호출 상한.
 *  - Supabase 가 설정돼 있으면 거기에(서버·Actions 가 함께 쓴다).
 *  - 없으면 서버 메모리에(개발용. 재시작하면 사라지고 서버가 여러 개면 서로 안 보인다).
 * 서비스 롤 키는 서버 전용이다.
 */
const url = () => process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
export const hasSupabase = (): boolean => Boolean(url() && key());

export const DAILY_CAP = (): number => Number(process.env.AI_DAILY_CAP || 300);

async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key()!, authorization: `Bearer ${key()}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ── 개발용 메모리 저장소 ───────────────────────────────────────────
// 전역 객체에 둔다: 개발 서버가 페이지를 다시 컴파일해도 값이 사라지지 않게(사라지면 호출 상한이 풀린다).
// 운영에서는 쓰지 않는다 — 서버 인스턴스마다 따로 생겨 상한을 지킬 수 없다(pipeline.ts 에서 Supabase 없으면 거부).
const g = globalThis as unknown as { __ebMem?: { judgments: Map<string, Judgment>; usage: Map<string, number>; debates?: Map<string, Debate> } };
const mem = (g.__ebMem ??= { judgments: new Map(), usage: new Map(), debates: new Map() });
mem.debates ??= new Map();
const memJudgments = mem.judgments;
const memUsage = mem.usage;
const memDebates = mem.debates;

export async function getJudgment(code: string, day: string): Promise<Judgment | null> {
  if (!hasSupabase()) return memJudgments.get(`${code}|${day}`) ?? null;
  const rows = await sb<{ payload: Judgment }[]>(`stock_judgments?code=eq.${code}&day=eq.${day}&select=payload&limit=1`);
  return rows[0]?.payload ?? null;
}

export async function saveJudgment(j: Judgment): Promise<void> {
  if (!hasSupabase()) {
    memJudgments.set(`${j.code}|${j.day}`, j);
    return;
  }
  await sb(`stock_judgments?on_conflict=code,day`, {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ code: j.code, day: j.day, payload: j }]),
  });
}

/**
 * 오늘 AI 호출 n 회를 쓸 수 있으면 예약하고 true, 상한을 넘으면 false.
 * n 이 음수면 반납(실패했을 때). Supabase 에서는 DB 함수 하나로 원자적으로 처리한다.
 */
export async function consumeAiCalls(day: string, n: number, cap: number = DAILY_CAP()): Promise<boolean> {
  if (!hasSupabase()) {
    const used = memUsage.get(day) ?? 0;
    if (used + n > cap || used + n < 0) return false;
    memUsage.set(day, used + n);
    return true;
  }
  return sb<boolean>("rpc/consume_ai_calls", { method: "POST", body: JSON.stringify({ p_day: day, p_n: n, p_cap: cap }) });
}

/** 거래량 상위 종목(미리 판단할 대상). Supabase 필요. */
export async function topVolumeCodes(limit: number): Promise<{ code: string; name: string }[]> {
  if (!hasSupabase()) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다");
  return sb(`quotes_latest?select=code,name&order=volume.desc&limit=${limit}`);
}

// ── 시장 토론(산업별, 하루 1번) ─────────────────────────────────────
export async function getDebate(sector: string, day: string): Promise<Debate | null> {
  if (!hasSupabase()) return memDebates.get(`${sector}|${day}`) ?? null;
  const rows = await sb<{ payload: Debate }[]>(`sector_debates?sector=eq.${encodeURIComponent(sector)}&day=eq.${day}&select=payload&limit=1`);
  return rows[0]?.payload ?? null;
}

export async function saveDebate(d: Debate): Promise<void> {
  if (!hasSupabase()) {
    memDebates.set(`${d.sector}|${d.day}`, d);
    return;
  }
  await sb(`sector_debates?on_conflict=sector,day`, {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ sector: d.sector, day: d.day, payload: d }]),
  });
}

/** 산업마다 가장 최근 토론 하나씩. */
export async function latestDebates(): Promise<Debate[]> {
  const all = hasSupabase()
    ? (await sb<{ payload: Debate }[]>("sector_debates?select=payload&order=day.desc&limit=80")).map((r) => r.payload)
    : [...memDebates.values()];
  const best = new Map<string, Debate>();
  for (const d of all) {
    const cur = best.get(d.sector);
    if (!cur || d.day > cur.day) best.set(d.sector, d);
  }
  return [...best.values()];
}
