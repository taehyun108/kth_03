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

export async function fetchNews(companyName: string, limit = 8): Promise<NewsItem[]> {
  const q = encodeURIComponent(`${companyName} 주식`);
  const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; EconomyBegin/0.1)" },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`뉴스 HTTP ${res.status}`);
  return parseNewsRss(await res.text()).slice(0, limit);
}
