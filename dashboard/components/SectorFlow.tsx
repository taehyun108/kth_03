import Link from "next/link";
import { fmtKRW, fmtPct, trend } from "@/lib/format";
import type { SectorTotal } from "@/lib/rank";

/** 산업별 거래대금 합계 순위. 산업 이름을 누르면 그 산업의 거래량 순위로 이동한다. */
export default function SectorFlow({ totals, selected }: { totals: SectorTotal[]; selected: string | null }) {
  const max = Math.max(1, ...totals.map((t) => t.tradingValue));
  return (
    <section className="card" aria-labelledby="flow-title">
      <h2 id="flow-title">
        산업별 거래대금<small>큰 순</small>
      </h2>
      <ol className="flow">
        {totals.map((t) => (
          <li key={t.sector}>
            <div className="row">
              <Link href={`/?sector=${encodeURIComponent(t.sector)}`} aria-current={selected === t.sector ? "true" : undefined}>
                <b>{t.sector}</b>
              </Link>
              <span>{fmtKRW(t.tradingValue)}</span>
            </div>
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${Math.max(2, (t.tradingValue / max) * 100)}%` }} />
            </span>
            <div className="sub">
              <span>1위 {t.leader}</span>
              <span className={trend(t.avgChangePct)}>{fmtPct(t.avgChangePct)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
