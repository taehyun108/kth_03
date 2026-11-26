import { fmtKRW, fmtPct, trend } from "@/lib/format";
import type { Debate, Stance } from "@/lib/debate";

export const STANCE_CLASS: Record<Stance, string> = { 성장: "up", 보합: "flat", 침체: "down" };
export const STANCE_MARK: Record<Stance, string> = { 성장: "▲", 보합: "■", 침체: "▼" };

function daysAgo(day: string, today: string): number {
  return Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${day}T00:00:00Z`).getTime()) / 86_400_000);
}

export default function DebateCard({ d, today }: { d: Debate; today: string }) {
  const ago = daysAgo(d.day, today);
  const votes = (["성장", "보합", "침체"] as Stance[]).filter((s) => d.votes[s] > 0);
  return (
    <article className="debate">
      <header>
        <h3>{d.sector}</h3>
        <span className={`stance ${STANCE_CLASS[d.label]}`}>
          <span aria-hidden="true">{STANCE_MARK[d.label]}</span> {d.label}
        </span>
      </header>
      <p className="votes" aria-label="투표 결과">
        {votes.map((s) => (
          <span key={s} className={STANCE_CLASS[s]}>
            {s} {d.votes[s]}
          </span>
        ))}
        {ago > 0 && <span className="flat">· {ago}일 전 토론</span>}
      </p>
      <p className="summary">{d.summary}</p>

      <ul className="finals" aria-label="투자자별 최종 입장">
        {d.round2.map((r) => (
          <li key={r.investor}>
            <span aria-hidden="true">{r.icon}</span> {r.investor}
            <span className={`mini ${r.stance ? STANCE_CLASS[r.stance] : "flat"}`}>{r.stance ?? "판단불가"}</span>
            {r.changed === true && <span className="changed" title="1라운드에서 판정을 바꿨습니다">↺ 바꿈</span>}
          </li>
        ))}
      </ul>

      <p className="stats">
        거래대금 {fmtKRW(d.stats.tradingValue)} (전체의 {d.stats.sharePct.toFixed(1)}%) ·{" "}
        <span className={trend(d.stats.avgChangePct)}>{fmtPct(d.stats.avgChangePct)}</span> · 근거 기사 {d.news.length}건
      </p>

      <details>
        <summary>토론 전체 보기</summary>
        <h4>1라운드 — 각자의 의견</h4>
        <ul className="rounds">
          {d.round1.map((v) => (
            <li key={v.investor}>
              <strong>
                {v.icon} {v.investor}
              </strong>{" "}
              <span className={v.stance ? STANCE_CLASS[v.stance] : "flat"}>
                {v.stance ?? "판단불가"}
                {v.confidence !== null && ` · 확신 ${v.confidence}`}
              </span>
              {v.reasons.length > 0 && (
                <ol>
                  {v.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
        <h4>2라운드 — 서로 보고 반박·수정</h4>
        <ul className="rounds">
          {d.round2.map((r) => (
            <li key={r.investor}>
              <strong>
                {r.icon} {r.investor}
              </strong>{" "}
              <span className={r.stance ? STANCE_CLASS[r.stance] : "flat"}>
                {r.stance ?? "판단불가"}
                {r.confidence !== null && ` · 확신 ${r.confidence}`}
              </span>
              {r.carried ? (
                <p className="flat">2라운드 답을 받지 못해 1라운드 판정을 그대로 썼습니다.</p>
              ) : (
                <>
                  {r.rebuttal && <p>“{r.rebuttal}”</p>}
                  {r.reasons[0] && <p className="flat">최종 근거: {r.reasons[0]}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
        {d.news.length > 0 && (
          <>
            <h4>근거로 쓴 기사 제목</h4>
            <ul className="rounds">
              {d.news.map((n) => (
                <li key={n.link}>
                  <a href={n.link} target="_blank" rel="noopener noreferrer">
                    {n.title}
                  </a>
                  {n.source && <span className="flat"> · {n.source}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="judge-foot">
          {d.day} 장 마감 후 생성 · 모델 {d.model} · 결론은 다수결(동수면 확신도 합, 그래도 같으면 보합)이며 AI가 뉴스 제목과 거래 현황만으로 낸 참고 의견입니다.
        </p>
      </details>
    </article>
  );
}
