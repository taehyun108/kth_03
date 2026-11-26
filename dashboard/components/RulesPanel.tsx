import { evaluateRules, type RuleVerdict } from "@/lib/rules";
import type { Fundamentals } from "@/lib/fundamentals";

const CLASS: Record<RuleVerdict, string> = { 충족: "rule-ok", "일부 충족": "rule-part", 미흡: "rule-bad", 판단불가: "flat" };

/** AI 와 별개로 항상 보이는, 계산식 기준 점검표. */
export default function RulesPanel({ f }: { f: Fundamentals }) {
  const cards = evaluateRules(f);
  return (
    <section className="card" aria-labelledby="rules-title" style={{ marginTop: 16 }}>
      <h2 id="rules-title">
        정량 기준 점검표<small>AI 아님 · 위 지표를 숫자 기준에 대 본 결과</small>
      </h2>
      <div className="pad">
        <div className="opinions">
          {cards.map((c) => (
            <article key={c.key} className="opinion">
              <header>
                <span className="who-name">
                  <span aria-hidden="true">{c.icon}</span> {c.name}
                </span>
                <span className={`verdict ${CLASS[c.verdict]}`}>
                  {c.verdict}
                  {c.total > 0 && (
                    <small>
                      {" "}
                      · {c.passed}/{c.total}
                    </small>
                  )}
                </span>
              </header>
              <ul className="criteria">
                {c.criteria.map((k) => (
                  <li key={k.label}>
                    <span className={k.ok === null ? "flat" : k.ok ? "rule-ok" : "rule-bad"} aria-label={k.ok === null ? "판단 불가" : k.ok ? "통과" : "미달"}>
                      {k.ok === null ? "–" : k.ok ? "✓" : "✗"}
                    </span>
                    <span>
                      <strong>{k.label}</strong> {k.value}
                      <small>
                        {k.rule}
                        {k.fromBook ? " · 책 기준" : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="judge-foot">
          “책 기준” 표시가 있는 그레이엄의 숫자(PER 15배, PBR 1.5배, PER×PBR 22.5)는 『The Intelligent Investor』 제14장에서 가져왔고, 이익은 3년 평균·적자 여부는
          데이터가 있는 최근 연도만 봅니다(책은 10년). <strong>나머지 숫자는 이 앱의 참고용 기본값이며 투자자 본인의 규칙이 아닙니다.</strong> 해자·경영진 같은 정성 판단은 계산으로
          할 수 없어 포함하지 않았고, 금융업은 부채비율을 비교하지 않습니다. 투자 권유가 아닙니다.
        </p>
      </div>
    </section>
  );
}
