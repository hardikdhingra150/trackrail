from __future__ import annotations

from collections import defaultdict
from typing import Any

from scipy.optimize import linprog
from firebase_admin import firestore
import firebase_admin
from firebase_admin import credentials


# ── Init Firebase Admin (only once) ──────────────────────────
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

BLOCK_ORDER = [f"B{i}" for i in range(1, 13)]
BLOCK_INDEX = {block: idx for idx, block in enumerate(BLOCK_ORDER, start=1)}


class MILPConflictSolver:
    """Corridor-level optimizer used by both recs and what-if simulation."""

    def _block_index(self, block_id: str) -> int:
        return BLOCK_INDEX.get(block_id, 1)

    def _priority_weight(self, priority: int) -> float:
        return {
            1: 1.45,  # premium / express
            2: 1.20,  # mail / intercity
            3: 0.95,  # freight
            4: 0.85,
        }.get(priority, 1.0)

    def _platform_name(self, index: int) -> str:
        return f"PF-{index}"

    def _normalize_trains(self, trains: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for idx, train in enumerate(trains):
            train_number = str(
                train.get("train_number")
                or train.get("trainNumber")
                or train.get("id")
                or f"T{idx + 1}"
            )
            current_block = str(train.get("current_block") or train.get("currentBlock") or "B1")
            normalized.append({
                "train_number": train_number,
                "current_block": current_block,
                "block_index": self._block_index(current_block),
                "priority": int(train.get("priority", 2)),
                "delay_minutes": float(train.get("delay_minutes", train.get("delayMinutes", 0)) or 0),
                "speed_kmph": float(train.get("speed_kmph", train.get("speed", 60)) or 60),
                "status": str(train.get("status", "on_time")),
                "direction": str(train.get("direction", "up")).lower(),
                "requested_platform": train.get("requested_platform") or train.get("requestedPlatform"),
                "platform_required": bool(train.get("platform_required", True)),
                "dwell_minutes": float(train.get("dwell_minutes", 0) or 0),
                "headway_need": float(train.get("headway_need", 1) or 1),
            })
        return normalized

    def _normalize_constraints(self, constraints: dict[str, Any] | None) -> dict[str, Any]:
        constraints = constraints or {}
        loop_availability = constraints.get("loop_availability") or constraints.get("loopAvailability") or {}
        platform_capacity = int(constraints.get("platform_capacity", constraints.get("platformCapacity", 4)) or 4)
        return {
            "headway_seconds": int(constraints.get("headway_seconds", constraints.get("headwaySeconds", 240)) or 240),
            "line_capacity": int(constraints.get("line_capacity", constraints.get("lineCapacity", 10)) or 10),
            "loop_availability": {
                block: int(loop_availability.get(block, 1) or 0)
                for block in BLOCK_ORDER
            },
            "platform_capacity": max(1, platform_capacity),
            "maintenance_blocks": [
                str(block) for block in constraints.get("maintenance_blocks", constraints.get("maintenanceBlocks", []))
            ],
            "weather_factor": float(constraints.get("weather_factor", constraints.get("weatherFactor", 1.0)) or 1.0),
            "gradient_penalty": float(constraints.get("gradient_penalty", constraints.get("gradientPenalty", 0.08)) or 0.08),
            "junction_margin": float(constraints.get("junction_margin", constraints.get("junctionMargin", 1.0)) or 1.0),
            "signal_spacing_penalty": float(
                constraints.get("signal_spacing_penalty", constraints.get("signalSpacingPenalty", 0.16)) or 0.16
            ),
        }

    def _solve_hold_plan(
        self,
        trains: list[dict[str, Any]],
        constraints: dict[str, Any],
    ) -> dict[str, float]:
        if not trains:
            return {}

        c = []
        bounds = []
        for train in trains:
            hold_cost = 1.0 / max(0.6, self._priority_weight(train["priority"]))
            delay_cost = 0.06 * max(0, train["delay_minutes"])
            c.append(hold_cost + delay_cost)
            bounds.append((0, 12))

        A_ub = []
        b_ub = []
        occupancy: dict[int, int] = defaultdict(int)
        for train in trains:
            occupancy[train["block_index"]] += 1

        for idx, train in enumerate(trains):
            congestion = max(0, occupancy[train["block_index"]] - 1)
            maintenance_penalty = 1 if train["current_block"] in constraints["maintenance_blocks"] else 0
            rhs = max(
                0,
                2.5 * congestion
                + 1.4 * maintenance_penalty
                + (constraints["weather_factor"] - 1.0) * 4
                + train["headway_need"] * 0.8
                - (train["speed_kmph"] / 100.0)
            )
            row = [0.0] * len(trains)
            row[idx] = -1.0
            A_ub.append(row)
            b_ub.append(-rhs)

        result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
        if not result.success:
            return {train["train_number"]: 2.0 for train in trains}

        return {
            train["train_number"]: round(max(0.0, float(result.x[idx])), 1)
            for idx, train in enumerate(trains)
        }

    def _assign_platforms(
        self,
        trains: list[dict[str, Any]],
        constraints: dict[str, Any],
    ) -> list[dict[str, Any]]:
        capacity = constraints["platform_capacity"]
        assigned: list[dict[str, Any]] = []
        usage: dict[str, int] = defaultdict(int)

        ordered = sorted(
            trains,
            key=lambda train: (
                train["priority"],
                -train["delay_minutes"],
                train["block_index"],
            )
        )

        for train in ordered:
            preferred = train.get("requested_platform")
            if preferred and usage[preferred] < 1:
                platform = str(preferred)
            else:
                best_index = min(range(1, capacity + 1), key=lambda idx: usage[self._platform_name(idx)])
                platform = self._platform_name(best_index)

            usage[platform] += 1
            assigned.append({
                "train_number": train["train_number"],
                "assigned_platform": platform,
                "reason": "requested platform respected" if preferred == platform else "balanced against live occupancy",
                "occupancy_load": usage[platform],
            })

        return assigned

    def _build_crossings(
        self,
        trains: list[dict[str, Any]],
        hold_plan: dict[str, float],
        constraints: dict[str, Any],
    ) -> list[dict[str, Any]]:
        block_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for train in trains:
            block_groups[train["current_block"]].append(train)

        crossings: list[dict[str, Any]] = []
        for block, block_trains in block_groups.items():
            if len(block_trains) < 2:
                continue

            ordered = sorted(
                block_trains,
                key=lambda train: (
                    train["priority"],
                    -train["delay_minutes"],
                    -train["speed_kmph"],
                )
            )
            winner = ordered[0]
            losers = ordered[1:]
            crossings.append({
                "block_id": block,
                "winner_train": winner["train_number"],
                "held_trains": [loser["train_number"] for loser in losers],
                "loop_used": constraints["loop_availability"].get(block, 0) > 0,
                "expected_spacing_minutes": round(
                    max(2.0, hold_plan.get(losers[0]["train_number"], 2.0) + constraints["headway_seconds"] / 120.0),
                    1,
                ),
                "explanation": (
                    f"Give precedence to {winner['train_number']} at {block}; "
                    f"other trains use loop/controlled headway to preserve throughput."
                ),
            })
        return crossings

    def optimize_section(self, payload: dict[str, Any]) -> dict[str, Any]:
        trains = self._normalize_trains(payload.get("trains", []))
        constraints = self._normalize_constraints(payload.get("constraints"))

        if not trains:
            return {
                "section_id": payload.get("section_id", "NDLS-GZB"),
                "objective_score": 0,
                "throughput_trains_per_hour": 0,
                "average_travel_time_reduction_min": 0,
                "precedence_plan": [],
                "crossing_plan": [],
                "platform_plan": [],
                "recommendations": [],
                "constraint_snapshot": constraints,
                "conflict_free": True,
                "kpis": {
                    "active_conflicts": 0,
                    "maintenance_hits": 0,
                    "headway_pressure": 0,
                    "platform_utilization_pct": 0,
                },
            }

        hold_plan = self._solve_hold_plan(trains, constraints)
        platform_plan = self._assign_platforms(trains, constraints)
        crossings = self._build_crossings(trains, hold_plan, constraints)

        occupancy: dict[str, int] = defaultdict(int)
        for train in trains:
            occupancy[train["current_block"]] += 1

        precedence = []
        recommendations = []
        maintenance_hits = 0

        for idx, train in enumerate(sorted(
            trains,
            key=lambda item: (
                item["priority"],
                -item["delay_minutes"],
                item["block_index"],
            ),
        ), start=1):
            congestion = max(0, occupancy[train["current_block"]] - 1)
            maintenance_hit = train["current_block"] in constraints["maintenance_blocks"]
            if maintenance_hit:
                maintenance_hits += 1

            hold_minutes = hold_plan.get(train["train_number"], 0.0)
            score = round(
                100
                + self._priority_weight(train["priority"]) * 24
                + train["delay_minutes"] * 0.8
                + train["speed_kmph"] * 0.08
                - hold_minutes * 4.2
                - congestion * 6
                - maintenance_hit * 8
                - constraints["gradient_penalty"] * train["block_index"] * 2.5
                - (constraints["weather_factor"] - 1.0) * 10,
                1,
            )
            action_type = "PROCEED"
            if maintenance_hit:
                action_type = "REROUTE"
            elif hold_minutes >= 4:
                action_type = "HOLD"
            elif congestion > 0 or train["speed_kmph"] > 85:
                action_type = "SLOW"

            precedence.append({
                "rank": idx,
                "train_number": train["train_number"],
                "current_block": train["current_block"],
                "action": action_type,
                "hold_minutes": hold_minutes,
                "precedence_score": score,
                "reason": (
                    "priority + delay + section occupancy"
                    if action_type == "PROCEED"
                    else "section conflict, headway, and safety constraints"
                ),
            })

            recommendations.append({
                "train_number": train["train_number"],
                "current_block": train["current_block"],
                "action_type": action_type,
                "hold_minutes": hold_minutes,
                "assigned_platform": next(
                    (item["assigned_platform"] for item in platform_plan if item["train_number"] == train["train_number"]),
                    "PF-1",
                ),
                "estimated_delay_reduction_min": round(max(1.0, 6.5 - hold_minutes + train["delay_minutes"] * 0.18), 1),
                "confidence": max(62, min(96, int(score))),
                "explanation": (
                    f"{action_type.title()} {train['train_number']} at {train['current_block']} "
                    f"using headway {constraints['headway_seconds']}s, "
                    f"line capacity {constraints['line_capacity']} tph, and current corridor occupancy."
                ),
            })

        throughput = round(
            max(
                4.0,
                constraints["line_capacity"]
                - sum(hold_plan.values()) / max(1, len(trains) * 4)
                - len(constraints["maintenance_blocks"]) * 0.6
                - (constraints["weather_factor"] - 1.0) * 1.8,
            ),
            1,
        )
        avg_reduction = round(
            max(1.0, sum(item["estimated_delay_reduction_min"] for item in recommendations) / max(1, len(recommendations))),
            1,
        )
        objective_score = round(
            throughput * 9
            + avg_reduction * 5
            + max(0, 12 - len(crossings) * 2)
            + max(0, 8 - maintenance_hits),
            1,
        )

        return {
            "section_id": payload.get("section_id", "NDLS-GZB"),
            "objective_score": objective_score,
            "throughput_trains_per_hour": throughput,
            "average_travel_time_reduction_min": avg_reduction,
            "precedence_plan": precedence,
            "crossing_plan": crossings,
            "platform_plan": platform_plan,
            "recommendations": recommendations,
            "constraint_snapshot": constraints,
            "conflict_free": len(crossings) == 0,
            "kpis": {
                "active_conflicts": len(crossings),
                "maintenance_hits": maintenance_hits,
                "headway_pressure": round(sum(hold_plan.values()), 1),
                "platform_utilization_pct": round(min(100.0, len(platform_plan) / constraints["platform_capacity"] * 100), 1),
            },
        }

    def simulate_scenario(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_payload = {
            "section_id": payload.get("section_id", "NDLS-GZB"),
            "trains": payload.get("trains", []),
            "constraints": payload.get("constraints", {}),
        }
        baseline = self.optimize_section(base_payload)

        scenario_payload = {
            "section_id": base_payload["section_id"],
            "trains": [dict(train) for train in payload.get("trains", [])],
            "constraints": dict(payload.get("constraints", {})),
        }

        scenario = payload.get("scenario", {}) or {}
        target_train = str(scenario.get("target_train", "") or "")
        hold_adjustment = float(scenario.get("hold_minutes", 0) or 0)
        reroute_train = str(scenario.get("reroute_train", "") or "")
        platform_override = scenario.get("platform_override", {}) or {}
        weather_factor = scenario.get("weather_factor")

        if weather_factor is not None:
            scenario_payload["constraints"]["weather_factor"] = weather_factor

        maintenance_blocks = list(scenario_payload["constraints"].get("maintenance_blocks", []))
        for block in scenario.get("maintenance_blocks", []) or []:
            if block not in maintenance_blocks:
                maintenance_blocks.append(block)
        scenario_payload["constraints"]["maintenance_blocks"] = maintenance_blocks

        for train in scenario_payload["trains"]:
            if str(train.get("train_number") or train.get("trainNumber")) == target_train:
                current_delay = float(train.get("delay_minutes", train.get("delayMinutes", 0)) or 0)
                train["delay_minutes"] = current_delay + hold_adjustment
            if str(train.get("train_number") or train.get("trainNumber")) == reroute_train:
                next_block = self._block_index(str(train.get("current_block") or train.get("currentBlock") or "B1")) + 1
                train["current_block"] = BLOCK_ORDER[min(len(BLOCK_ORDER) - 1, next_block)]
            if str(train.get("train_number") or train.get("trainNumber")) in platform_override:
                train["requested_platform"] = platform_override[str(train.get("train_number") or train.get("trainNumber"))]

        candidate = self.optimize_section(scenario_payload)
        return {
            "baseline": baseline,
            "scenario": candidate,
            "delta": {
                "throughput_delta": round(
                    candidate["throughput_trains_per_hour"] - baseline["throughput_trains_per_hour"], 1
                ),
                "travel_time_reduction_delta": round(
                    candidate["average_travel_time_reduction_min"] - baseline["average_travel_time_reduction_min"], 1
                ),
                "objective_delta": round(candidate["objective_score"] - baseline["objective_score"], 1),
                "conflict_delta": candidate["kpis"]["active_conflicts"] - baseline["kpis"]["active_conflicts"],
            },
        }

    def get_integration_blueprint(self) -> dict[str, Any]:
        return {
            "sources": [
                {
                    "name": "Signal Interlocking Feed",
                    "type": "operational",
                    "status": "READY",
                    "latency_ms": 120,
                    "security": "mTLS + signed webhook",
                    "payloads": ["block occupancy", "signal aspect", "route lock status"],
                },
                {
                    "name": "Traffic Management System",
                    "type": "planning",
                    "status": "READY",
                    "latency_ms": 240,
                    "security": "OAuth2 service account",
                    "payloads": ["control chart", "precedence history", "controller actions"],
                },
                {
                    "name": "NTES / Timetable Feed",
                    "type": "schedule",
                    "status": "READY",
                    "latency_ms": 180,
                    "security": "API gateway + IP allowlist",
                    "payloads": ["schedule", "platform plan", "expected crossing points"],
                },
                {
                    "name": "Rolling Stock Health",
                    "type": "asset",
                    "status": "SIMULATED",
                    "latency_ms": 320,
                    "security": "JWT + audit logging",
                    "payloads": ["loco health", "crew readiness", "maintenance blocks"],
                },
            ],
            "api_contracts": [
                "POST /optimize-section",
                "POST /simulate-scenario",
                "POST /controller-override",
                "GET /controller-overrides",
                "GET /integration-sources",
            ],
        }

    def resolve(self, conflict_data: dict) -> dict:
        train_a = conflict_data.get("trainA", "Train A")
        train_b = conflict_data.get("trainB", "Train B")
        severity = conflict_data.get("severity", "medium")
        block_id = conflict_data.get("blockId", "B1")

        payload = {
            "section_id": "NDLS-GZB",
            "trains": [
                {
                    "train_number": train_a,
                    "current_block": block_id,
                    "priority": 1 if severity == "high" else 2,
                    "delay_minutes": 8 if severity == "high" else 4,
                    "speed_kmph": 72,
                    "status": "delayed",
                    "direction": "up",
                },
                {
                    "train_number": train_b,
                    "current_block": block_id,
                    "priority": 2,
                    "delay_minutes": 5 if severity != "low" else 2,
                    "speed_kmph": 58,
                    "status": "delayed",
                    "direction": "down",
                },
            ],
            "constraints": {
                "headway_seconds": 240,
                "line_capacity": 10,
                "platform_capacity": 4,
                "maintenance_blocks": [],
                "weather_factor": 1.0 if severity != "high" else 1.15,
                "loop_availability": {block_id: 1},
            },
        }
        optimized = self.optimize_section(payload)
        top_rec = optimized["recommendations"][0]
        total_delay_saved = round(
            sum(item["estimated_delay_reduction_min"] for item in optimized["recommendations"][:2]),
            1,
        )
        confidence = top_rec["confidence"]

        resolution = {
            "resolvedAction": top_rec["explanation"],
            "delayAdded_A": top_rec["hold_minutes"] if top_rec["train_number"] == train_a else 0.0,
            "delayAdded_B": top_rec["hold_minutes"] if top_rec["train_number"] == train_b else 0.0,
            "totalDelaySaved": total_delay_saved,
            "strategy": "Constraint-aware corridor optimizer",
            "confidence": confidence,
            "precedencePlan": optimized["precedence_plan"],
            "crossingPlan": optimized["crossing_plan"],
            "platformPlan": optimized["platform_plan"],
        }

        conflict_id = f"{train_a}-{train_b}-{block_id}"
        recommendations = []
        for idx, rec in enumerate(optimized["recommendations"][:3], start=1):
            recommendations.append({
                "rank": idx,
                "actionType": rec["action_type"].lower(),
                "conflictId": conflict_id,
                "holdBlock": block_id,
                "affectedTrains": 2,
                "estimatedDelaySaved": rec["estimated_delay_reduction_min"],
                "explanation": rec["explanation"],
                "confidence": rec["confidence"],
                "createdAt": firestore.SERVER_TIMESTAMP,
            })

        old = db.collection("recommendations").where("conflictId", "==", conflict_id).stream()
        for doc in old:
            doc.reference.delete()

        for rec in recommendations:
            db.collection("recommendations").add(rec)

        print(f"✅ [{conflict_id}] Written {len(recommendations)} recommendations to Firestore")
        return resolution
