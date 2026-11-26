import quotesJson from "../data/quotes.json";

/**
 * 오늘의 명언. 명언은 data/quotes.json 에 있고, 모두 원문(또는 책 스캔 발췌)에서 문장을 확인한 것만 넣는다.
 * 확인 규칙과 다시 확인하는 방법은 README 의 '4단계' 참고. 확인하지 못한 명언은 넣지 않는다.
 */
export type Verification = {
  /** '원문 문자열 대조'(원문 전체에서 문장이 그대로 나옴) 또는 '책 스캔 검색 발췌'(전체를 내려받지 못해 검색 발췌로 확인) */
  method: string;
  checkedAt: string;
  /** 원문에서 찾은 문구(소문자). 출처를 열어 Ctrl+F 로 다시 확인할 때 쓴다 */
  checks?: string[];
  /** 문구를 다시 대조할 수 있는 텍스트 주소(없으면 PDF 라서 수동 확인) */
  textUrl?: string | null;
  manualOnly?: boolean;
  note?: string;
};

export type Quote = {
  en: string;
  ko: string;
  source: { title: string; detail: string; url: string };
  verification: Verification;
};

export type InvestorQuotes = {
  key: string;
  name: string;
  icon: string;
  /** 투자자의 관점 한 줄 (investors/*.md 프롬프트의 기준에서 가져옴) */
  philosophy: string;
  quotes: Quote[];
};

export const QUOTES = quotesJson as InvestorQuotes[];

/** 'YYYY-MM-DD' -> 1970-01-01 부터 지난 날 수. 형식이 틀리면 null. */
export function dayNumber(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

export type QuoteOfDay = { investor: InvestorQuotes; quote: Quote };

/**
 * 그날의 투자자와 명언. 하루에 한 명씩 돌아가고(날 수 % 인원), 같은 투자자가 다시 나올 때마다 그의 다음 명언으로 넘어간다.
 * 같은 날이면 언제 누가 열어도 같은 결과(서버·브라우저·시간대와 무관). 명언이 없는 투자자는 건너뛴다.
 */
export function quoteOfDay(day: string, data: InvestorQuotes[] = QUOTES): QuoteOfDay | null {
  const pool = data.filter((i) => i.quotes.length > 0);
  const n = dayNumber(day);
  if (pool.length === 0 || n === null) return null;
  const investor = pool[((n % pool.length) + pool.length) % pool.length];
  const turn = Math.floor(n / pool.length);
  const quote = investor.quotes[((turn % investor.quotes.length) + investor.quotes.length) % investor.quotes.length];
  return { investor, quote };
}
