import sample from "../data/snapshot.sample.json";
import type { Snapshot, Stock } from "./types";

type Row = {
  code: string;
  name: string;
  market: Stock["market"];
  sector: string;
  price: number | string;
  prev_close: number | string | null;
  change_pct: number | string | null;
  volume: number | string;
  trading_value: number | string;
  bar_date: string;
  updated_at: string;
};

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

function toStock(r: Row): Stock {
  return {
    code: r.code,
    name: r.name,
    market: r.market,
    sector: r.sector,
    price: Number(r.price),
    prevClose: num(r.prev_close),
    changePct: num(r.change_pct),
    volume: Number(r.volume),
    tradingValue: Number(r.trading_value),
  };
}

function sampleSnapshot(warning?: string): Snapshot {
  return { ...(sample as Omit<Snapshot, "source">), source: "sample", warning } as Snapshot;
}

/**
 * 순위 화면용 시세. Supabase 가 설정돼 있으면 수집기가 올린 최신 값을, 아니면 저장소의 견본을 쓴다.
 * 서비스 롤 키는 서버에서만 읽는다 (NEXT_PUBLIC_ 접두사 금지).
 */
export async function getSnapshot(): Promise<Snapshot> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sampleSnapshot();

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/quotes_latest?select=*&order=volume.desc&limit=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Row[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return sampleSnapshot("수집 데이터가 아직 비어 있어 견본 데이터를 보여 주고 있습니다.");
    }
    const asOf = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), rows[0].updated_at);
    const barDate = rows.reduce((max, r) => (r.bar_date > max ? r.bar_date : max), rows[0].bar_date);
    return { asOf, barDate, source: "supabase", stocks: rows.map(toStock) };
  } catch (err) {
    console.error("시세 조회 실패", err);
    return sampleSnapshot("수집 데이터를 읽지 못해 견본 데이터를 보여 주고 있습니다.");
  }
}
