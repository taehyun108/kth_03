/**
 * 좌측 상단 '오늘의 명언' 자리. 4단계에서 투자자별 명언(출처 확인된 것만)을 하루 한 명씩 돌려 보여 준다.
 * 지금은 자리만 잡아 두고 비어 있음을 분명히 표시한다.
 */
export default function QuoteSlot() {
  return (
    <section className="quote empty" aria-labelledby="quote-title">
      <h2 id="quote-title">오늘의 명언</h2>
      <p>투자 대가의 관점과 명언이 이 자리에 매일 한 명씩 표시됩니다.</p>
      <p className="who">준비 중 · 4단계에서 추가</p>
    </section>
  );
}
