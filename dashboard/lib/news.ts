export type NewsItem = { title: string; source: string; link: string; publishedAt: string };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

/** 구글 뉴스 RSS -> 기사 목록(제목·출처·링크·시각). 제목 끝의 ' - 출처' 는 떼어 낸다. 기사 본문은 다루지 않는다. */
export function parseNewsRss(xml: string, now: Date = new Date(), maxAgeDays = 14): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const source = tag(block, "source");
    let title = tag(block, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = tag(block, "link");
    const pub = new Date(tag(block, "pubDate"));
    if (!title || !link.startsWith("https://") || Number.isNaN(pub.getTime())) continue;
    if (now.getTime() - pub.getTime() > maxAgeDays * 86_400_000) continue;
    const key = title.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, source, link, publishedAt: pub.toISOString() });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** 검색어로 구글 뉴스 RSS 를 읽는다. 최근 maxAgeDays 일 안의 기사만, 최신순으로 limit 개. */
export async function fetchNewsQuery(query: string, opts: { limit?: number; maxAgeDays?: number } = {}): Promise<NewsItem[]> {
  const { limit = 8, maxAgeDays = 14 } = opts;
  const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; EconomyBegin/0.1)" },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`뉴스 HTTP ${res.status}`);
  return parseNewsRss(await res.text(), new Date(), maxAgeDays).slice(0, limit);
}

export const fetchNews = (companyName: string, limit = 8): Promise<NewsItem[]> => fetchNewsQuery(`${companyName} 주식`, { limit });

// ── 여러 검색어를 합쳐 쓰는 조회 (산업 토론용) ───────────────────────
const SPAM_SOURCES = new Set(["IndexBox"]);
/** 시장조사 보고서를 기사처럼 올리는 스팸(예: "○○ 시장 2035년 전망: …수요가 성장 견인 - 뉴스 및 통계") */
export function isSpamNews(n: Pick<NewsItem, "title" | "source">): boolean {
  return SPAM_SOURCES.has(n.source) || /시장\s*20[3-9]\d년/.test(n.title) || /-\s*뉴스 및 통계$/.test(n.title);
}

/** 검색어 여러 개를 동시에 읽어 합치고, 중복·스팸을 거르고, 최신순 limit 개. 일부 검색어가 실패해도 나머지로 진행한다. */
export async function fetchNewsQueries(queries: string[], opts: { limit?: number; maxAgeDays?: number } = {}): Promise<NewsItem[]> {
  const { limit = 12, maxAgeDays = 7 } = opts;
  const settled = await Promise.allSettled(queries.map((q) => fetchNewsQuery(q, { limit: 40, maxAgeDays })));
  const ok = settled.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled");
  if (ok.length === 0) throw new Error("뉴스 검색에 모두 실패했습니다");
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const n of ok.flatMap((r) => r.value)) {
    const key = n.title.replace(/\s+/g, "");
    if (seen.has(key) || isSpamNews(n)) continue;
    seen.add(key);
    merged.push(n);
  }
  return merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, limit);
}
