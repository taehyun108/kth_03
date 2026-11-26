import type { NewsItem } from "@/lib/news";

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** 기사 전문은 보여 주지 않고 제목·출처·시각과 원문 링크만 둔다(저작권). */
export default function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return <p className="flat" style={{ padding: "0 16px 16px" }}>최근 2주 안의 뉴스를 찾지 못했습니다.</p>;
  return (
    <ul className="news">
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noopener noreferrer">
            {n.title}
          </a>
          <span>
            {n.source || "출처 미상"} · {when(n.publishedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
