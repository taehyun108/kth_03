const nf = new Intl.NumberFormat("ko-KR");

export const fmtInt = (n: number): string => nf.format(Math.round(n));

/** 원 단위 금액을 조·억·만으로 줄여 쓴다. 음수는 앞에 -. */
export function fmtKRW(won: number): string {
  if (won < 0) return `-${fmtKRW(-won)}`;
  const eok = won / 1e8;
  if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조`;
  if (eok >= 1) return `${fmtInt(eok)}억`;
  return `${fmtInt(won / 1e4)}만`;
}

/** 등락률. 한국 관례대로 부호를 붙이고, 값이 없으면 대시. */
export function fmtPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "–";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** 'up' 상승(빨강) / 'down' 하락(파랑) / 'flat' */
export function trend(n: number | null): "up" | "down" | "flat" {
  if (n === null || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}

/** ISO 시각을 한국 시간 'M월 D일 HH:MM' 으로. */
export function fmtKST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return parts;
}

/** 'YYYY-MM-DD' 거래일을 '2026년 11월 26일' 로. */
export function fmtDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(d);
}
