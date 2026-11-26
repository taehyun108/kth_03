import { fmtKRW } from "@/lib/format";
import type { Fundamentals } from "@/lib/fundamentals";
import type { FundSource } from "@/lib/fundamentalsSource";

const amount = (v: number | null) => (v === null ? "–" : fmtKRW(v));

const SOURCE_TEXT: Record<FundSource, string> = {
  cache: "저장된 계산값",
  live: "방금 야후에서 계산",
  "stale-cache": "야후 접속 실패로 오래된 저장값 사용",
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export default function FundamentalsView({ f, source, fetchedAt }: { f: Fundamentals; source: FundSource; fetchedAt: string }) {
  return (
    <>
      <p className="meta" style={{ padding: "0 16px" }}>
        <span>최근 결산 {f.fiscalDate} 기준 (연간)</span>
        <span>계산식을 함께 표시합니다</span>
        <span className={source === "stale-cache" ? "badge sample" : "badge"}>
          {SOURCE_TEXT[source]} · {when(fetchedAt)}
        </span>
      </p>
      <ul className="metrics">
        {f.metrics.map((m) => (
          <li key={m.key}>
            <div className="m-row">
              <span>{m.label}</span>
              <strong>{m.display}</strong>
            </div>
            <p className="formula">{m.formula}</p>
          </li>
        ))}
      </ul>
      <div className="table-scroll">
        <table className="hist">
          <caption className="sr">연도별 실적</caption>
          <thead>
            <tr>
              <th scope="col">연도</th>
              <th scope="col">매출</th>
              <th scope="col">영업이익</th>
              <th scope="col">순이익</th>
              <th scope="col">영업현금흐름</th>
              <th scope="col">ROE(기말 자본)</th>
            </tr>
          </thead>
          <tbody>
            {[...f.history].reverse().map((h) => (
              <tr key={h.year}>
                <td>{h.year}</td>
                <td>{amount(h.revenue)}</td>
                <td className={h.operatingIncome !== null && h.operatingIncome < 0 ? "down" : ""}>{amount(h.operatingIncome)}</td>
                <td className={h.netIncome !== null && h.netIncome < 0 ? "down" : ""}>{amount(h.netIncome)}</td>
                <td>{amount(h.operatingCashFlow)}</td>
                <td>{h.roe === null ? "–" : `${h.roe.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
