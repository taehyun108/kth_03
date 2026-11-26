import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collect_quotes as cq

UNI = [
    {"code": "005930", "symbol": "005930.KS", "name": "삼성전자", "market": "KOSPI", "sector": "반도체"},
    {"code": "247540", "symbol": "247540.KQ", "name": "에코프로비엠", "market": "KOSDAQ", "sector": "이차전지"},
    {"code": "000000", "symbol": "000000.KS", "name": "없는종목", "market": "KOSPI", "sector": "금융"},
]
DATES = pd.to_datetime(["2026-11-24", "2026-11-25", "2026-11-26"])


def frames():
    close = pd.DataFrame({"005930.KS": [100.0, 110.0, 121.0], "247540.KQ": [50.0, 50.0, float("nan")]}, index=DATES)
    volume = pd.DataFrame({"005930.KS": [10, 20, 30], "247540.KQ": [5, 6, float("nan")]}, index=DATES)
    return close, volume


def test_build_rows_computes_change_value_and_skips_missing():
    close, volume = frames()
    rows, skipped = cq.build_rows(close, volume, UNI, "2026-11-26T15:00:00+09:00")
    by = {r["code"]: r for r in rows}
    s = by["005930"]
    assert (s["price"], s["prev_close"], s["volume"]) == (121.0, 110.0, 30)
    assert s["change_pct"] == 10.0 and s["trading_value"] == 121 * 30 and s["bar_date"] == "2026-11-26"
    assert skipped == ["000000"]          # 야후에 없는 종목은 건너뛴다


def test_nan_latest_bar_falls_back_to_last_valid_day():
    close, volume = frames()
    rows, _ = cq.build_rows(close, volume, UNI, "x")
    e = {r["code"]: r for r in rows}["247540"]
    assert e["bar_date"] == "2026-11-25" and e["volume"] == 6 and e["prev_close"] == 50.0


def test_zero_volume_day_is_not_used_as_today():
    close, volume = frames()
    volume.loc[DATES[2], "005930.KS"] = 0       # 장 시작 전 빈 봉
    rows, _ = cq.build_rows(close, volume, UNI, "x")
    s = {r["code"]: r for r in rows}["005930"]
    assert s["bar_date"] == "2026-11-25" and s["price"] == 110.0


def test_universe_file_is_clean():
    uni = cq.load_universe(Path(cq.ROOT / "data" / "universe.json"))
    assert len(uni) >= 150
    assert len({u["code"] for u in uni}) == len(uni)            # 코드 중복 없음
    assert all(len(u["code"]) == 6 and u["symbol"].startswith(u["code"]) for u in uni)
    assert {u["market"] for u in uni} == {"KOSPI", "KOSDAQ"}
