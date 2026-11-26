"""장중 시세 수집기 — 종목 목록(universe.json)의 시세·거래량을 야후에서 받아 순위용 스냅샷을 만든다.

    python collector/collect_quotes.py --out data/snapshot.json     # 파일로만 저장 (확인용)
    python collector/collect_quotes.py --upload                     # Supabase 에 올림 (Actions 에서 사용)

환경변수 (--upload 일 때만): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  · 없으면 올리지 않고 요약만 출력한 뒤 정상 종료한다 (키를 넣기 전에도 워크플로가 실패하지 않게).
  · 서비스 롤 키는 서버·Actions 에서만 쓴다. 화면(브라우저)으로 내려가면 안 된다.

야후 한국 시세는 몇 분 지연될 수 있다. 거래대금은 '종가 x 거래량' 으로 추정한 값이다.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent.parent
CHUNK = 60                 # 한 번에 받을 종목 수
MIN_OK_RATIO = 0.5         # 이보다 적게 받으면 야후 차단·장애로 보고 실패 처리
UPLOAD_CHUNK = 200


def load_universe(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def _clean(series) -> list[tuple[str, float]]:
    """(날짜, 값) 목록에서 NaN 을 뺀다."""
    out = []
    for idx, val in series.items():
        if val is None or (isinstance(val, float) and math.isnan(val)):
            continue
        out.append((str(idx)[:10], float(val)))
    return out


def build_rows(close, volume, universe: list[dict], as_of: str) -> tuple[list[dict], list[str]]:
    """일봉 표(Close, Volume: 행=날짜, 열=야후 심볼)에서 순위용 행을 만든다. 받지 못한 종목은 따로 돌려준다."""
    rows, skipped = [], []
    for u in universe:
        sym = u["symbol"]
        if sym not in close or sym not in volume:
            skipped.append(u["code"])
            continue
        closes = _clean(close[sym])
        vols = dict(_clean(volume[sym]))
        # 종가와 거래량이 모두 있고 거래량이 0 보다 큰 마지막 날을 '오늘'로 본다
        valid = [(d, c) for d, c in closes if vols.get(d, 0) > 0]
        if not valid:
            skipped.append(u["code"])
            continue
        bar_date, price = valid[-1]
        prev = valid[-2][1] if len(valid) >= 2 else None
        vol = int(vols[bar_date])
        rows.append({
            "code": u["code"],
            "name": u["name"],
            "market": u["market"],
            "sector": u["sector"],
            "price": round(price, 2),
            "prev_close": round(prev, 2) if prev else None,
            "change_pct": round((price - prev) / prev * 100, 2) if prev else None,
            "volume": vol,
            "trading_value": int(round(price * vol)),
            "bar_date": bar_date,
            "updated_at": as_of,
        })
    return rows, skipped


def fetch(universe: list[dict]):
    import pandas as pd
    import yfinance as yf

    warnings.filterwarnings("ignore")
    closes, volumes = [], []
    for i in range(0, len(universe), CHUNK):
        syms = [u["symbol"] for u in universe[i:i + CHUNK]]
        df = yf.download(syms, period="5d", interval="1d", progress=False,
                         threads=True, auto_adjust=False)
        if df is None or df.empty:
            continue
        closes.append(df["Close"] if len(syms) > 1 else df["Close"].to_frame(syms[0]))
        volumes.append(df["Volume"] if len(syms) > 1 else df["Volume"].to_frame(syms[0]))
    if not closes:
        return None, None
    return pd.concat(closes, axis=1), pd.concat(volumes, axis=1)


def upload(rows: list[dict], url: str, key: str) -> None:
    import requests

    endpoint = f"{url.rstrip('/')}/rest/v1/quotes_latest?on_conflict=code"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for i in range(0, len(rows), UPLOAD_CHUNK):
        resp = requests.post(endpoint, headers=headers, data=json.dumps(rows[i:i + UPLOAD_CHUNK]), timeout=30)
        if resp.status_code >= 300:
            raise RuntimeError(f"Supabase 업로드 실패 HTTP {resp.status_code}: {resp.text[:200]}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--universe", default=str(ROOT / "data" / "universe.json"))
    ap.add_argument("--out", help="스냅샷 JSON 저장 경로 (화면 샘플 데이터 갱신용)")
    ap.add_argument("--upload", action="store_true", help="Supabase 에 올린다")
    args = ap.parse_args(argv)

    universe = load_universe(Path(args.universe))
    as_of = datetime.now(KST).isoformat(timespec="seconds")
    close, volume = fetch(universe)
    if close is None:
        print("야후에서 한 종목도 받지 못했습니다 — 차단되었거나 장애입니다.", file=sys.stderr)
        return 1
    rows, skipped = build_rows(close, volume, universe, as_of)
    ratio = len(rows) / len(universe)
    print(f"수집 {len(rows)}/{len(universe)}종목 ({ratio:.0%}), 건너뜀 {len(skipped)}: {skipped[:10]}")
    if ratio < MIN_OK_RATIO:
        print("수집 비율이 너무 낮아 저장하지 않습니다.", file=sys.stderr)
        return 1

    if args.out:
        snapshot = {"asOf": as_of, "barDate": max(r["bar_date"] for r in rows), "stocks": [
            {"code": r["code"], "name": r["name"], "market": r["market"], "sector": r["sector"],
             "price": r["price"], "prevClose": r["prev_close"], "changePct": r["change_pct"],
             "volume": r["volume"], "tradingValue": r["trading_value"]} for r in rows]}
        Path(args.out).write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"저장: {args.out}")

    if args.upload:
        import os
        url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 업로드는 건너뜁니다.")
        else:
            upload(rows, url, key)
            print(f"Supabase 업로드 완료 ({len(rows)}행)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
