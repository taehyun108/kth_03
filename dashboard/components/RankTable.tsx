import { fmtInt, fmtKRW, fmtPct, trend } from "@/lib/format";
import type { Stock } from "@/lib/types";

export default function RankTable({ rows, caption }: { rows: Stock[]; caption: string }) {
  const maxVolume = Math.max(1, ...rows.map((r) => r.volume));
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="rank">
              순위
            </th>
            <th scope="col">종목</th>
            <th scope="col" className="hide-sm">
              산업
            </th>
            <th scope="col">현재가</th>
            <th scope="col" className="hide-sm">
              등락률
            </th>
            <th scope="col">거래량</th>
            <th scope="col" className="hide-sm">
              거래대금
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code}>
              <td className="rank">{i + 1}</td>
              <td className="name">
                <strong>{r.name}</strong>
                <span>
                  {r.code} · {r.market}
                </span>
              </td>
              <td className="sector-cell hide-sm">{r.sector}</td>
              <td>
                {fmtInt(r.price)}
                <span className={`pct-sm ${trend(r.changePct)}`}>{fmtPct(r.changePct)}</span>
              </td>
              <td className={`hide-sm ${trend(r.changePct)}`}>{fmtPct(r.changePct)}</td>
              <td className="volcell">
                <span className="num">{fmtInt(r.volume)}</span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, (r.volume / maxVolume) * 100)}%` }} />
                </span>
              </td>
              <td className="hide-sm">{fmtKRW(r.tradingValue)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="flat" style={{ textAlign: "center" }}>
                표시할 종목이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
