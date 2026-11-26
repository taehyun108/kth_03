"use client";

import { useState } from "react";
import { VERDICT_LABEL, type Judgment, type Verdict } from "@/lib/judge";

const CLASS: Record<Verdict, string> = { 사자: "up", 팔자: "down", 중립: "flat", 판단불가: "flat" };

function stamp(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

export default function JudgmentPanel({ code, initial, investorCount }: { code: string; initial: Judgment | null; investorCount: number }) {
  const [judgment, setJudgment] = useState<Judgment | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { judgment?: Judgment; error?: string };
      if (!res.ok || !data.judgment) throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);
      setJudgment(data.judgment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!judgment) {
    return (
      <div className="judge-empty">
        <p>오늘 이 종목의 판단은 아직 없습니다. 버튼을 누르면 투자 대가 {investorCount}인이 위 수치와 뉴스 제목을 보고 판단합니다 (AI 호출 {investorCount}회, 30초 안팎).</p>
        <button type="button" className="btn" onClick={run} disabled={busy} aria-busy={busy}>
          {busy ? "판단 중…" : "투자 대가 판단 받기"}
        </button>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const counts = (["사자", "중립", "팔자"] as Verdict[]).map((v) => ({ v, n: judgment.opinions.filter((o) => o.verdict === v).length })).filter((c) => c.n > 0);

  return (
    <div>
      <p className="tally" aria-label="판단 집계">
        {counts.map((c) => (
          <span key={c.v} className={CLASS[c.v]}>
            {VERDICT_LABEL[c.v]} {c.n}
          </span>
        ))}
      </p>
      <div className="opinions">
        {judgment.opinions.map((o) => (
          <article key={o.investor} className="opinion">
            <header>
              <span className="who-name">
                <span aria-hidden="true">{o.icon}</span> {o.investor}
              </span>
              <span className={`verdict ${CLASS[o.verdict]}`}>
                {VERDICT_LABEL[o.verdict]}
                {o.confidence !== null && <small> · 확신 {o.confidence}</small>}
              </span>
            </header>
            {o.reasons.length > 0 ? (
              <ol>
                {o.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            ) : (
              <p className="flat">{o.error ?? "이유를 받지 못했습니다."}</p>
            )}
          </article>
        ))}
      </div>
      <p className="judge-foot">
        {stamp(judgment.createdAt)} 생성 · 모델 {judgment.model} · 같은 날 같은 종목은 저장된 결과를 다시 보여 줍니다. AI가 위 수치와 뉴스 제목만으로 낸 참고 의견이며 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
