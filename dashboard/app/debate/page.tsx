import DebateCard from "@/components/DebateCard";
import { STANCES, type Debate, type Stance } from "@/lib/debate";
import { INVESTORS } from "@/lib/investors.generated";
import { kstDay } from "@/lib/judge";
import { latestDebates } from "@/lib/store";

export const metadata = { title: "시장 토론 — Economy Begin" };
export const dynamic = "force-dynamic";

const GROUPS: { stance: Stance; title: string; hint: string }[] = [
  { stance: "성장", title: "성장 시장", hint: "앞으로 커질 것으로 본 산업" },
  { stance: "보합", title: "보합", hint: "지금 수준에서 제자리로 본 산업" },
  { stance: "침체", title: "침체(수면기)", hint: "수면기에 들어간다고 본 산업" },
];

export default async function DebatePage() {
  let debates: Debate[] = [];
  let error = "";
  try {
    debates = await latestDebates();
  } catch (e) {
    error = e instanceof Error ? e.message : "알 수 없는 오류";
  }
  const today = kstDay();
  const latest = debates.reduce((max, d) => (d.createdAt > max ? d.createdAt : max), "");

  return (
    <>
      <section className="card soon" aria-labelledby="debate-intro">
        <h2 id="debate-intro">시장 토론</h2>
        <p>
          투자 대가 {INVESTORS.length}인이 산업별 기사와 오늘 거래 현황을 보고 의견을 낸 뒤(1라운드), 서로의 의견을 읽고 반박하거나 판정을 바꿉니다(2라운드).
          결론은 다수결이고, 하루 1번 장 마감 후 갱신됩니다.
        </p>
        {latest && (
          <p>
            마지막 갱신{" "}
            {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(latest))}
          </p>
        )}
      </section>

      {error && (
        <p className="notice" role="status" style={{ marginTop: 16 }}>
          토론을 불러오지 못했습니다. ({error})
        </p>
      )}
      {!error && debates.length === 0 && (
        <p className="notice" role="status" style={{ marginTop: 16 }}>
          아직 만들어진 토론이 없습니다. 장 마감 후 자동으로 생성되며(Actions의 <strong>Sector debates</strong>), 바로 만들려면 Actions에서 직접 실행하세요.
        </p>
      )}

      {debates.length > 0 &&
        GROUPS.map((g) => {
          const list = debates
            .filter((d) => d.label === g.stance)
            .sort((a, b) => b.votes[g.stance] - a.votes[g.stance] || b.stats.tradingValue - a.stats.tradingValue);
          return (
            <section key={g.stance} className="group" aria-labelledby={`g-${g.stance}`}>
              <h2 id={`g-${g.stance}`}>
                {g.title}
                <small>
                  {list.length}개 산업 · {g.hint}
                </small>
              </h2>
              {list.length === 0 ? (
                <p className="flat">해당하는 산업이 없습니다.</p>
              ) : (
                <div className="debates">
                  {list.map((d) => (
                    <DebateCard key={d.sector} d={d} today={today} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      <p className="judge-foot" style={{ marginTop: 16 }}>
        {STANCES.join(" / ")} 판정은 AI가 만든 참고 의견이며 투자 권유가 아닙니다.
      </p>
    </>
  );
}
