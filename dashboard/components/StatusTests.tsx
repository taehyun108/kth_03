"use client";
import { useState } from "react";

const TESTS = [
  { target: "yahoo", label: "야후 시세 시험" },
  { target: "news", label: "뉴스 시험" },
  { target: "ai", label: "AI 시험 (하루 호출 1회 사용)" },
] as const;

type R = { ok: boolean; message: string; ms?: number } | null;

export default function StatusTests() {
  const [res, setRes] = useState<Record<string, R>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(target: string) {
    setBusy(target);
    try {
      const r = await fetch("/api/status/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string; ms?: number };
      setRes((p) => ({ ...p, [target]: { ok: Boolean(j.ok), message: j.message ?? j.error ?? "응답 오류", ms: j.ms } }));
    } catch {
      setRes((p) => ({ ...p, [target]: { ok: false, message: "요청에 실패했습니다." } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="status-list">
      {TESTS.map((t) => (
        <li key={t.target}>
          <button type="button" className="btn" onClick={() => run(t.target)} disabled={busy !== null} aria-busy={busy === t.target}>
            {busy === t.target ? "시험 중…" : t.label}
          </button>
          {res[t.target] && (
            <p role="status" className={res[t.target]!.ok ? "rule-ok" : "err"}>
              {res[t.target]!.ok ? "✓ " : "✗ "}
              {res[t.target]!.message}
              {res[t.target]!.ms !== undefined && ` (${res[t.target]!.ms}ms)`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
