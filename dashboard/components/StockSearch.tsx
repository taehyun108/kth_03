import { UNIVERSE } from "@/lib/universe";

/** 종목명이나 6자리 코드를 입력해 조회한다. 목록 안 종목은 자동완성, 목록 밖은 코드를 직접 넣는다. */
export default function StockSearch({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/stock" method="get" className="search" role="search">
      <label htmlFor="q" className="sr">
        종목명 또는 6자리 코드
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        list="stock-list"
        placeholder="종목명 또는 6자리 코드 (예: 삼성전자, 005930)…"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <datalist id="stock-list">
        {UNIVERSE.map((u) => (
          <option key={u.code} value={u.name}>
            {u.code} · {u.sector}
          </option>
        ))}
      </datalist>
      <button type="submit" className="btn">
        조회
      </button>
    </form>
  );
}
