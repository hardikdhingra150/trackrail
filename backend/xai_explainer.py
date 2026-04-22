import shap
import joblib
import pandas as pd
import numpy as np
import json
from typing import Union

model      = joblib.load('models/rf_model.pkl')
le_train   = joblib.load('models/le_train.pkl')
le_station = joblib.load('models/le_station.pkl')

with open('models/rf_meta.json') as f:
    meta = json.load(f)

FEATURES = meta['features']

# TreeExplainer — fastest for RF, exact SHAP values
explainer = shap.TreeExplainer(model)


def explain_prediction(data: Union[dict, str], station_code: str = None) -> dict:
    """
    Accepts either:
      - explain_prediction("12301", "NDLS")       ← direct call
      - explain_prediction({...context dict...})  ← called from main.py
    """
    if isinstance(data, dict):
        mode = data.get("mode", "delay")

        # Conflict mode — no SHAP needed, return rule-based explanation
        if mode == "conflict":
            action   = data.get("resolvedAction", "unknown")
            severity = data.get("severity", "medium")
            return {
                "mode":           "conflict",
                "trainA":         data.get("trainA"),
                "trainB":         data.get("trainB"),
                "resolvedAction": action,
                "reason": (
                    f"MILP solver selected '{action}' based on "
                    f"{severity} severity conflict at block {data.get('blockId')}"
                ),
                "factors": [
                    {"factor": "conflict_severity", "value": severity},
                    {"factor": "block",             "value": data.get("blockId")},
                    {"factor": "resolution",        "value": action},
                ]
            }

        # Delay mode — pull train + station from dict
        train_num    = data.get("train_number")
        station_code = data.get("station_code")
        confidence   = data.get("confidence")

        if not train_num or not station_code:
            return {
                "mode":        "delay",
                "shap_values": {},
                "reason":      "Insufficient data for SHAP explanation"
            }

        return _shap_explain(train_num, station_code, confidence)

    # Called directly as (train_number, station_code)
    return _shap_explain(data, station_code)


def _shap_explain(train_number: str, station_code: str, confidence: float = None) -> dict:
    """Core SHAP explanation logic — handles both list and 3D array output."""
    df = pd.read_csv('data/cleaned_data.csv')

    try:
        train_enc   = int(le_train.transform([train_number])[0])
        station_enc = int(le_station.transform([station_code])[0])
    except ValueError:
        return {
            "mode":        "delay",
            "shap_values": {},
            "reason":      "Unknown train or station — SHAP skipped"
        }

    row = df[
        (df['train_number_enc'] == train_enc) &
        (df['station_code_enc'] == station_enc)
    ]
    if row.empty:
        row = df[df['train_number_enc'] == train_enc]
    if row.empty:
        return {
            "mode":        "delay",
            "shap_values": {},
            "reason":      "No data found — SHAP skipped"
        }

    # Keep as DataFrame → preserves feature names, no sklearn warning
    X = row[FEATURES].iloc[[0]]

    # Get predicted class index
    proba          = model.predict_proba(X)[0]
    pred_class_idx = int(np.argmax(proba))
    predicted_cls  = model.classes_[pred_class_idx]

    # ── Compute SHAP values ──────────────────────────────────────
    raw_shap = explainer.shap_values(X)

    # raw_shap can be:
    #   A) list of n_classes arrays, each shape (1, n_features)  ← older SHAP
    #   B) 3D numpy array shape (1, n_features, n_classes)       ← newer SHAP
    try:
        if isinstance(raw_shap, list):
            # Case A — list[class_idx] → shape (1, n_features)
            # Clamp index to valid range just in case
            idx = min(pred_class_idx, len(raw_shap) - 1)
            sv  = raw_shap[idx][0]
        else:
            # Case B — numpy array (1, n_features, n_classes)
            raw_np = np.array(raw_shap)
            if raw_np.ndim == 3:
                # shape: (1, n_features, n_classes) → pick class axis
                idx = min(pred_class_idx, raw_np.shape[2] - 1)
                sv  = raw_np[0, :, idx]
            elif raw_np.ndim == 2:
                # shape: (1, n_features) — single output fallback
                sv = raw_np[0]
            else:
                sv = raw_np.flatten()
    except Exception:
        # Ultimate fallback — use global feature importances
        sv = model.feature_importances_

    # ── Build explanation dict ───────────────────────────────────
    explanation = {
        feat: round(float(val), 4)
        for feat, val in zip(FEATURES, sv)
    }

    # Sort by absolute impact (most influential first)
    sorted_exp = dict(
        sorted(explanation.items(), key=lambda x: abs(x[1]), reverse=True)
    )

    top_factor = list(sorted_exp.keys())[0]

    return {
        "mode":            "delay",
        "train_number":    train_number,
        "station_code":    station_code,
        "predicted_class": predicted_cls,
        "shap_values":     sorted_exp,
        "top_factor":      top_factor,
        "reason": (
            f"Delay classified as {predicted_cls} — "
            f"most influenced by '{top_factor}' "
            f"(confidence {confidence if confidence is not None else round(float(proba.max()) * 100, 1)}%)"
        )
    }
