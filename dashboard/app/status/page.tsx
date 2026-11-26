import StatusTests from "@/components/StatusTests";
import { collectStatus, type Level } from "@/lib/status";

export const metadata = { title: "상태 점검 — Economy Begin" };
export const dynamic = "force-dynamic";

const MARK: Record<Level, string> = { ok: "✓ 정상", warn: "△ 확인", bad: "✗ 문제" };
const CLS: Record<Level, string> = { ok: "rule-ok", warn: "rule-part", bad: "rule-bad" };

export default async function StatusPage() {
  const checks = await collectStatus();
  const bad = checks.filter((c) => c.level === "bad").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  return (
    <>
      <section className="card">
        <h2>
          상태 점검<small>{bad ? `문제 ${bad}건` : warn ? `확인 ${warn}건` : "모두 정상"}</small>
        </h2>
        <ul className="status-list pad">
          {checks.map((c) => (
            <li key={c.id}>
              <strong>{c.title}</strong> <span className={CLS[c.level]}>{MARK[c.level]}</span>
              <p>{c.detail}</p>
              {c.fix && <p className="formula">→ {c.fix}</p>}
            </li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>
          외부 접속 시험<small>배포된 서버에서 실제로 호출</small>
        </h2>
        <div className="pad">
          <StatusTests />
          <p className="judge-foot">키 값은 화면에 표시하지 않고 개수만 보여 줍니다. 이 페이지도 접속 비밀번호로 보호됩니다.</p>
        </div>
      </section>
    </>
  );
}
