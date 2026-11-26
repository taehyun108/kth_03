import Link from "next/link";
import { unstable_cache } from "next/cache";
import FundamentalsView from "@/components/FundamentalsView";
import RulesPanel from "@/components/RulesPanel";
import JudgmentPanel from "@/components/JudgmentPanel";
import NewsList from "@/components/NewsList";
import StockSearch from "@/components/StockSearch";
import { getSnapshot } from "@/lib/data";
import { getFundamentals } from "@/lib/fundamentalsSource";
import { fmtInt, fmtPct, trend } from "@/lib/format";
import { INVESTORS } from "@/lib/investors.generated";
import { kstDay } from "@/lib/judge";
import { fetchNews, type NewsItem } from "@/lib/news";
import { getJudgment } from "@/lib/store";
import { UNIVERSE, lookup } from "@/lib/universe";

export const metadata = { title: "종목 조회 — Economy Begin" };
export const dynamic = "force-dynamic";

const cachedFundamentals = unstable_cache(async (code: string) => getFundamentals(code), ["fundamentals"], { revalidate: 3600 });
const cachedNews = unstable_cache(async (name: string) => fetchNews(name), ["news"], { revalidate: 600 });

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "알 수 없는 오류");

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const found = q ? lookup(q) : null;

  return (
    <>
      <StockSearch defaultValue={q} />
      {!q && <Intro />}
      {found?.kind === "none" && (
        <p className="notice" role="status">
          '{q}' 에 맞는 종목을 목록에서 찾지 못했습니다. 목록 밖 종목은 <strong>6자리 코드</strong>로 조회해 주세요.
        </p>
      )}
      {found?.kind === "candidates" && (
        <section className="card" aria-labelledby="cand-title">
          <h2 id="cand-title">
            '{q}' 와 비슷한 종목<small>{found.stocks.length}개</small>
          </h2>
          <ul className="news">
            {found.stocks.map((s) => (
              <li key={s.code}>
                <Link href={`/stock?q=${s.code}`}>{s.name}</Link>
                <span>
                  {s.code} · {s.market} · {s.sector}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(found?.kind === "found" || found?.kind === "code") && (
        <Detail code={found.kind === "found" ? found.stock.code : found.code} knownName={found.kind === "found" ? found.stock.name : null} sector={found.kind === "found" ? found.stock.sector : null} />
      )}
    </>
  );
}

function Intro() {
  return (
    <section className="card soon">
      <h2>종목 조회</h2>
      <p>종목명이나 6자리 코드를 입력하면 재무제표 지표(계산식 포함), 최근 뉴스 제목, 투자 대가 {INVESTORS.length}인의 매수·매도 판단을 보여 줍니다.</p>
      <p>
        목록에 있는 {UNIVERSE.length}개 종목은 자동완성이 되고, 목록 밖 종목도 6자리 코드를 넣으면 조회됩니다. 판단은 같은 날 같은 종목이면 저장된 결과를 다시 보여 줍니다.
      </p>
    </section>
  );
}

async function Detail({ code, knownName, sector }: { code: string; knownName: string | null; sector: string | null }) {
  const day = kstDay();
  const [snapshot, fundRes, cachedJudgment] = await Promise.all([
    getSnapshot(),
    cachedFundamentals(code).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, error: errMsg(e) })),
    getJudgment(code, day).catch(() => null),
  ]);
  const name = knownName ?? (fundRes.ok ? fundRes.v.f.name : code);

  let news: NewsItem[] = [];
  let newsError = "";
  try {
    news = await cachedNews(name);
  } catch (e) {
    newsError = errMsg(e);
  }

  const quote = snapshot.stocks.find((s) => s.code === code);
  const price = quote?.price ?? (fundRes.ok ? fundRes.v.f.price : null);

  return (
    <>
      <header className="stock-head">
        <h2>{name}</h2>
        <p>
          {code}
          {sector ? ` · ${sector}` : ""}
          {price !== null && (
            <>
              {" · "}
              <strong>{fmtInt(price)}원</strong>
              {quote && <span className={trend(quote.changePct)}> {fmtPct(quote.changePct)}</span>}
            </>
          )}
        </p>
      </header>

      <section className="card" aria-labelledby="judge-title">
        <h2 id="judge-title">
          투자 대가 {INVESTORS.length}인의 판단<small>AI 참고 의견</small>
        </h2>
        <div className="pad">
          {fundRes.ok ? (
            <JudgmentPanel code={code} initial={cachedJudgment} investorCount={INVESTORS.length} />
          ) : (
            <p className="err">재무 데이터를 불러오지 못해 판단할 수 없습니다. ({fundRes.error})</p>
          )}
        </div>
      </section>

      {fundRes.ok && <RulesPanel f={fundRes.v.f} />}

      <section className="card" aria-labelledby="fund-title" style={{ marginTop: 16 }}>
        <h2 id="fund-title">
          재무 지표<small>야후 재무제표로 직접 계산</small>
        </h2>
        {fundRes.ok ? <FundamentalsView f={fundRes.v.f} source={fundRes.v.source} fetchedAt={fundRes.v.fetchedAt} /> : <p className="err pad">재무제표를 불러오지 못했습니다. ({fundRes.error})</p>}
      </section>

      <section className="card" aria-labelledby="news-title" style={{ marginTop: 16 }}>
        <h2 id="news-title">
          최근 뉴스<small>제목·출처만, 원문은 링크로</small>
        </h2>
        {newsError ? <p className="err pad">뉴스를 불러오지 못했습니다. ({newsError})</p> : <NewsList items={news} />}
      </section>
    </>
  );
}
