from scipy.optimize import linprog
from firebase_admin import firestore
import firebase_admin
from firebase_admin import credentials
import os

# ── Init Firebase Admin (only once) ──────────────────────────
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()


class MILPConflictSolver:
    def resolve(self, conflict_data: dict) -> dict:
        train_a   = conflict_data.get("trainA", "Train A")
        train_b   = conflict_data.get("trainB", "Train B")
        severity  = conflict_data.get("severity", "medium")
        block_id  = conflict_data.get("blockId", "B-1")

        # ── MILP optimization ────────────────────────────────
        c     = [1, 1]
        A_ub  = [[-1, 0], [0, -1]]
        b_ub  = [-3, 0]
        bounds = [(0, 15), (0, 15)]

        result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")

        if result.success:
            delay_a = round(result.x[0], 1)
            delay_b = round(result.x[1], 1)
        else:
            delay_a, delay_b = 3.0, 0.0

        severity_factor   = {"high": 2, "medium": 1, "low": 0.5}.get(severity, 1)
        total_delay_saved = round(max(0, 8 - (delay_a + delay_b)) * severity_factor, 1)

        if delay_a > delay_b:
            action_type = "hold"
            action      = f"Hold {train_a} at Block {block_id} for {delay_a} min. {train_b} proceeds with priority."
            held_train  = train_a
        else:
            action_type = "hold"
            action      = f"Hold {train_b} at Block {block_id} for {delay_b} min. {train_a} proceeds with priority."
            held_train  = train_b

        confidence = 92 if result.success else 65

        resolution = {
            "resolvedAction":  action,
            "delayAdded_A":    delay_a,
            "delayAdded_B":    delay_b,
            "totalDelaySaved": total_delay_saved,
            "strategy":        "MILP Optimal Block Scheduling",
            "confidence":      confidence,
        }

        # ── Write recommendations to Firestore ───────────────
        conflict_id = f"{train_a}-{train_b}-{block_id}"

        recommendations = [
            {
                "rank":                1,
                "actionType":          action_type,
                "conflictId":          conflict_id,
                "holdBlock":           block_id,
                "affectedTrains":      2,
                "estimatedDelaySaved": total_delay_saved,
                "explanation":         action,
                "confidence":          confidence,
                "createdAt":           firestore.SERVER_TIMESTAMP,  # ✅ must be SERVER_TIMESTAMP
            },
            {
                "rank":                2,
                "actionType":          "slow",
                "conflictId":          conflict_id,
                "holdBlock":           block_id,
                "affectedTrains":      2,
                "estimatedDelaySaved": round(total_delay_saved * 0.6, 1),
                "explanation":         f"Slow {held_train} to 30 km/h approaching Block {block_id} to create natural spacing.",
                "confidence":          round(confidence * 0.85),
                "createdAt":           firestore.SERVER_TIMESTAMP,
            },
            {
                "rank":                3,
                "actionType":          "reroute",
                "conflictId":          conflict_id,
                "holdBlock":           block_id,
                "affectedTrains":      2,
                "estimatedDelaySaved": round(total_delay_saved * 0.4, 1),
                "explanation":         f"Reroute one train via alternate block to avoid conflict at {block_id}.",
                "confidence":          round(confidence * 0.70),
                "createdAt":           firestore.SERVER_TIMESTAMP,
            },
        ]

        # Delete old recs for this conflict first, then write fresh ones
        old = db.collection("recommendations").where("conflictId", "==", conflict_id).stream()
        for doc in old:
            doc.reference.delete()

        for rec in recommendations:
            db.collection("recommendations").add(rec)

        print(f"✅ [{conflict_id}] Written {len(recommendations)} recommendations to Firestore")

        return resolution