import { kstDay } from "@/lib/judge";
import { quoteOfDay } from "@/lib/quotes";

/**
 * 좌측 상단 '오늘의 명언'. 하루에 한 명씩 돌아가며 그 투자자의 관점과 명언(한국어 번역 + 영어 원문)을 보여 준다.
 * 모든 명언은 출처를 열어 문장을 직접 다시 확인할 수 있다.
 */
export default function QuoteSlot() {
  const today = quoteOfDay(kstDay());
  if (!today) {
    return (
      <section className="quote empty" aria-labelledby="quote-title">
        <h2 id="quote-title">오늘의 명언</h2>
        <p>표시할 명언이 없습니다.</p>
      </section>
    );
  }
  const { investor, quote } = today;
  const v = quote.verification;
  const exact = v.method === "원문 문자열 대조";

  return (
    <section className="quote" aria-labelledby="quote-title">
      <h2 id="quote-title">
        오늘의 명언 <span className="quote-who"><span aria-hidden="true">{investor.icon}</span> {investor.name}</span>
      </h2>
      <blockquote>
        <p lang="ko">{quote.ko}</p>
      </blockquote>
      <details className="quote-orig">
        <summary>영어 원문 · 출처</summary>
        <p lang="en" className="en">“{quote.en}”</p>
        <p className="src">
          <a href={quote.source.url} target="_blank" rel="noopener noreferrer">
            {quote.source.title}
          </a>
          <span> · {quote.source.detail}</span>
        </p>
        <p className="verify" title={v.note ?? ""}>
          <span className={exact ? "ok" : "partial"}>{exact ? "원문 대조 확인" : "발췌 확인"}</span> · {v.checkedAt}
          {!exact && " · 책 전체는 대조하지 못함"}
          {v.manualOnly && " · PDF라 직접 열어 확인"}
          {v.note && <span className="note"> — {v.note}</span>}
        </p>
        <p className="perspective">
          <strong>{investor.name}의 관점</strong> {investor.philosophy}
        </p>
        <p className="tr">한국어는 번역입니다.</p>
      </details>
    </section>
  );
}
