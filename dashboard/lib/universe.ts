import universeJson from "../data/universe.json";

export type UniverseStock = {
  code: string;
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
};

export const UNIVERSE = universeJson as UniverseStock[];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type Lookup =
  | { kind: "found"; stock: UniverseStock }
  | { kind: "code"; code: string } // 목록 밖 6자리 코드
  | { kind: "candidates"; stocks: UniverseStock[] }
  | { kind: "none" };

/** 검색어 -> 종목. 6자리 코드, 정확한 이름, 이름 일부 순으로 찾는다. */
export function lookup(query: string, universe: UniverseStock[] = UNIVERSE): Lookup {
  const q = query.trim();
  if (!q) return { kind: "none" };
  if (/^\d{6}$/.test(q)) {
    const hit = universe.find((u) => u.code === q);
    return hit ? { kind: "found", stock: hit } : { kind: "code", code: q };
  }
  const nq = norm(q);
  const exact = universe.filter((u) => norm(u.name) === nq);
  if (exact.length === 1) return { kind: "found", stock: exact[0] };
  const partial = universe.filter((u) => norm(u.name).includes(nq));
  if (partial.length === 1) return { kind: "found", stock: partial[0] };
  if (partial.length > 1) return { kind: "candidates", stocks: partial.slice(0, 12) };
  return { kind: "none" };
}
