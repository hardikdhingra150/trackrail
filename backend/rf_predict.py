import joblib
import pandas as pd
import numpy as np
import json
import re

# ── Load model + meta once at import time ────────────────────────
model = joblib.load('models/rf_model.pkl')

with open('models/rf_meta.json') as f:
    meta = json.load(f)

FEATURES = meta['features']
# FEATURES = [
#   'average_delay_minutes', 'pct_right_time', 'pct_slight_delay',
#   'pct_significant_delay', 'pct_cancelled_unknown'
# ]

# ── Cache cleaned data for stats lookup ──────────────────────────
_df_cache = None
_route_df_cache = None

def _get_df():
    global _df_cache
    if _df_cache is None:
        _df_cache = pd.read_csv('data/cleaned_data.csv')
        _df_cache['train_number'] = _df_cache['train_number'].astype(str)
        _df_cache['station_code'] = _df_cache['station_code'].astype(str)
    return _df_cache


def _get_route_df():
    global _route_df_cache
    if _route_df_cache is None:
        _route_df_cache = pd.read_csv(
            'data/train_delays.csv',
            usecols=['train_number', 'train_name', 'station_code', 'station_name']
        ).dropna(subset=['train_number', 'station_code', 'station_name'])
        _route_df_cache['train_number'] = _route_df_cache['train_number'].astype(str)
        _route_df_cache['station_code'] = _route_df_cache['station_code'].astype(str)
        _route_df_cache['station_name'] = _route_df_cache['station_name'].astype(str)
    return _route_df_cache


def _calibrate_confidence(proba: np.ndarray, match_scope: str) -> float:
    """Convert overconfident RF probabilities into a steadier UI-facing score."""
    ordered = np.sort(np.asarray(proba, dtype=float))[::-1]
    top1 = float(ordered[0]) if ordered.size > 0 else 0.0
    top2 = float(ordered[1]) if ordered.size > 1 else 0.0
    margin = max(0.0, top1 - top2)

    calibrated = 45 + (top1 * 35) + (margin * 20)
    if match_scope == "train_fallback":
        calibrated -= 12

    return round(float(min(98.0, max(38.0, calibrated))), 1)


def get_train_route(train_number: str) -> list[dict]:
    route_df = _get_route_df()
    rows = route_df[route_df['train_number'] == str(train_number)]
    if rows.empty:
        return []

    route = (
        rows[['station_code', 'station_name']]
        .drop_duplicates(subset=['station_code'], keep='first')
        .to_dict(orient='records')
    )
    return route


def align_route_direction(route: list[dict], from_station: str | None = None, to_station: str | None = None) -> list[dict]:
    if len(route) < 2:
        return route

    from_code = str(from_station).upper() if from_station else None
    to_code = str(to_station).upper() if to_station else None
    codes = [stop["station_code"].upper() for stop in route]

    if from_code and to_code:
        if codes[0] == from_code and codes[-1] == to_code:
            return route
        if codes[0] == to_code and codes[-1] == from_code:
            return list(reversed(route))
        if from_code in codes and to_code in codes and codes.index(from_code) > codes.index(to_code):
            return list(reversed(route))

    if from_code and codes[-1] == from_code:
        return list(reversed(route))
    if to_code and codes[0] == to_code:
        return list(reversed(route))
    return route


def infer_station_from_block(
    train_number: str,
    current_block: str | None,
    from_station: str | None = None,
    to_station: str | None = None,
) -> dict | None:
    route = align_route_direction(get_train_route(train_number), from_station, to_station)
    if not route:
        return None

    if not current_block:
        return route[0]

    match = re.search(r'(\d+)', str(current_block).upper())
    if not match:
        return route[0]

    block_num = max(1, min(int(match.group(1)), 6))
    route_idx = round(((block_num - 1) / 5) * (len(route) - 1))
    return route[route_idx]


def predict_delay(train_number: str, station_code: str) -> dict:
    """Returns delay prediction for a given train + station."""
    df = _get_df()

    match_scope = "exact"

    # 1. Exact match: train + station
    row = df[
        (df['train_number'] == str(train_number)) &
        (df['station_code'] == str(station_code))
    ]

    # 2. Fallback: train-level average across all stations
    if row.empty:
        row = df[df['train_number'] == str(train_number)]
        match_scope = "train_fallback"

    # 3. Global fallback
    if row.empty:
        return {
            "train_number":          train_number,
            "station_code":          station_code,
            "delay_class":           "UNKNOWN",
            "confidence":            0,
            "average_delay_minutes": None,
            "error":                 f"Train '{train_number}' not in training data"
        }

    row = row.iloc[0]

    # ── Build feature DataFrame (preserves column names → no sklearn warning) ──
    feature_values = {
        'average_delay_minutes':  float(row['average_delay_minutes']),
        'pct_right_time':         float(row['pct_right_time']),
        'pct_slight_delay':       float(row['pct_slight_delay']),
        'pct_significant_delay':  float(row['pct_significant_delay']),
        'pct_cancelled_unknown':  float(row['pct_cancelled_unknown']),
        'station_code_enc':       int(row.get('station_code_enc', 0)),
    }
    features = pd.DataFrame([{key: feature_values[key] for key in FEATURES}])[FEATURES]

    prediction = model.predict(features)[0]
    proba      = model.predict_proba(features)[0]
    confidence = _calibrate_confidence(proba, match_scope)

    class_probs = {
        cls: round(float(p) * 100, 1)
        for cls, p in zip(model.classes_, proba)
    }

    return {
        "train_number":          train_number,
        "station_code":          station_code,
        "delay_class":           prediction,
        "confidence":            confidence,
        "class_probabilities":   class_probs,
        "average_delay_minutes": round(float(row['average_delay_minutes']), 1),
        "pct_right_time":        round(float(row['pct_right_time']), 1),
        "pct_significant_delay": round(float(row['pct_significant_delay']), 1),
        "matched_on":            match_scope,
    }


def get_top_delayed_trains(limit: int = 10) -> list:
    """Returns top N most delayed trains from dataset."""
    df = _get_df()
    top = (
        df.groupby('train_number')['average_delay_minutes']
        .mean()
        .sort_values(ascending=False)
        .head(limit)
        .reset_index()
    )
    return top[['train_number', 'average_delay_minutes']].to_dict(orient='records')


def get_station_stats(station_code: str) -> dict:
    """Returns aggregated delay stats for a station."""
    df = _get_df()
    rows = df[df['station_code'] == str(station_code)]

    if rows.empty:
        return {"error": f"Station '{station_code}' not found"}

    return {
        "station_code":          station_code,
        "avg_delay_minutes":     round(rows['average_delay_minutes'].mean(), 1),
        "pct_right_time":        round(rows['pct_right_time'].mean(), 1),
        "pct_significant_delay": round(rows['pct_significant_delay'].mean(), 1),
        "total_trains":          int(rows['train_number'].nunique()),
    }
