import Link from "next/link";
import RankTable from "@/components/RankTable";
import SectorFlow from "@/components/SectorFlow";
import { getSnapshot } from "@/lib/data";
import { fmtDate, fmtKST } from "@/lib/format";
import { sectorTotals, sectorsOf, topByVolume } from "@/lib/rank";

const LIMIT_ALL = 30;
const LIMIT_SECTOR = 15;

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ sector?: string }> }) {
  const [{ sector: rawSector }, snapshot] = await Promise.all([searchParams, getSnapshot()]);
  const sectors = sectorsOf(snapshot.stocks);
  const sector = rawSector && sectors.includes(rawSector) ? rawSector : null;

  const rows = topByVolume(snapshot.stocks, sector, sector ? LIMIT_SECTOR : LIMIT_ALL);
  const totals = sectorTotals(snapshot.stocks);

  return (
    <>
      <div className="meta">
        <span className="badge">지연 시세</span>
        <span>거래일 {fmtDate(snapshot.barDate)}</span>
        <span>수집 {fmtKST(snapshot.asOf)}</span>
        <span>{snapshot.stocks.length}개 종목 대상</span>
        {snapshot.source === "sample" && <span className="badge sample">견본 데이터</span>}
      </div>
      {snapshot.source === "sample" && (
        <p className="notice" role="status">
          {snapshot.warning ?? "수집기가 아직 연결되지 않아 저장소에 들어 있는 견본 데이터를 보여 주고 있습니다."}
        </p>
      )}

      <ul className="chips" aria-label="산업 선택">
        <li>
          <Link className="chip" href="/" aria-current={sector === null ? "true" : undefined}>
            전체
          </Link>
        </li>
        {sectors.map((s) => (
          <li key={s}>
            <Link className="chip" href={`/?sector=${encodeURIComponent(s)}`} aria-current={sector === s ? "true" : undefined}>
              {s}
            </Link>
          </li>
        ))}
      </ul>

      <div className="layout">
        <section className="card" aria-labelledby="rank-title">
          <h2 id="rank-title">
            {sector ?? "전체"} 거래량 순위<small>상위 {rows.length}개</small>
          </h2>
          <RankTable rows={rows} caption={`${sector ?? "전체"} 거래량 상위 ${rows.length}개 종목`} />
        </section>
        <SectorFlow totals={totals} selected={sector} />
      </div>
    </>
  );
}
