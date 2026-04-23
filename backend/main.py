"""
main.py — TrackMind AI FastAPI backend
Endpoints: /predict-delay, /resolve-conflict, /stats, /health,
           /top-delayed, /station-stats, /model-info
"""

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from contextlib import asynccontextmanager
from collections import defaultdict
import traceback
import time
import json
import logging

from rf_predict    import (
    predict_delay as rf_predict,
    get_top_delayed_trains,
    get_station_stats,
    get_train_route,
    infer_station_from_block,
)
from milp_solver   import MILPConflictSolver
from xai_explainer import explain_prediction


# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("trackmind")


# ── Valid blocks ──────────────────────────────────────────────
VALID_BLOCKS = {f"B{i}" for i in range(1, 13)}   # B1–B12


# ── In-memory stats (reset on restart) ───────────────────────
_stats: dict = {
    "total_predictions":  0,
    "total_conflicts":    0,
    "total_batch_calls":  0,
    "avg_prediction_ms":  0.0,
    "avg_conflict_ms":    0.0,
    "prediction_times":   [],
    "conflict_times":     [],
    "errors":             0,
    "started_at":         None,
}
_override_audit: list[dict] = []


# ── Simple in-memory cache (ttl=10s) ─────────────────────────
_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 10.0


def cache_get(key: str) -> Optional[dict]:
    if key in _cache:
        val, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _cache[key]
    return None


def cache_set(key: str, val: dict) -> None:
    _cache[key] = (val, time.time())
    if len(_cache) > 200:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]


# ── Rate limiter (per-IP, 60 req/min; localhost exempt) ──────
_rate_buckets: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT  = 60
RATE_WINDOW = 60.0


def check_rate_limit(ip: str) -> bool:
    now    = time.time()
    _rate_buckets[ip] = [t for t in _rate_buckets[ip] if now - t < RATE_WINDOW]
    if len(_rate_buckets[ip]) >= RATE_LIMIT:
        return False
    _rate_buckets[ip].append(now)
    return True


async def rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    if ip in {"127.0.0.1", "::1", "localhost"}:
        return
    if not check_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {RATE_LIMIT} requests per minute"
        )


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    _stats["started_at"] = time.time()
    try:
        with open("models/rf_meta.json") as f:
            meta = json.load(f)
        log.info("=" * 50)
        log.info("TrackMind AI Backend starting up")
        log.info(f"  Model      : RandomForestClassifier")
        log.info(f"  Accuracy   : {meta.get('accuracy', 'N/A')}")
        log.info(f"  CV Mean    : {meta.get('cv_mean', 'N/A')}")
        log.info(f"  Classes    : {meta.get('classes', [])}")
        log.info(f"  Features   : {len(meta.get('features', []))}")
        log.info("=" * 50)
    except FileNotFoundError:
        log.warning("⚠️  rf_meta.json not found — run train_rf.py first!")
    yield
    log.info("TrackMind AI Backend shutting down")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title       = "TrackMind AI",
    description = "Railway conflict resolution and delay prediction API",
    version     = "4.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],
    allow_methods  = ["*"],
    allow_headers  = ["*"],
)

solver = MILPConflictSolver()


# ── Request / Response models ─────────────────────────────────

class PredictRequest(BaseModel):
    train_number: str = Field(..., min_length=1, max_length=20)
    station_code: str = Field(..., min_length=1, max_length=10)


class BatchPredictRequest(BaseModel):
    requests: list[PredictRequest] = Field(..., max_length=200)


class LivePredictRequest(BaseModel):
    train_number: str = Field(..., min_length=1, max_length=20)
    current_block: str = Field(..., min_length=1, max_length=10)
    from_station: Optional[str] = Field(None, max_length=10)
    to_station: Optional[str] = Field(None, max_length=10)


class LiveBatchPredictRequest(BaseModel):
    requests: list[LivePredictRequest] = Field(..., max_length=200)


class ConflictInput(BaseModel):
    trainA:   str = Field(..., min_length=1, max_length=20)
    trainB:   str = Field(..., min_length=1, max_length=20)
    severity: str = Field("medium")
    blockId:  str = Field("B1")

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        if v not in {"low", "medium", "high"}:
            raise ValueError("severity must be low, medium, or high")
        return v

    @field_validator("blockId")
    @classmethod
    def validate_block(cls, v: str) -> str:
        if v not in VALID_BLOCKS:
            raise ValueError(f"blockId must be one of {sorted(VALID_BLOCKS)}")
        return v

    @field_validator("trainB")
    @classmethod
    def trains_differ(cls, v: str, info) -> str:
        if info.data.get("trainA") == v:
            raise ValueError("trainA and trainB must be different")
        return v


class OptimizationTrainInput(BaseModel):
    train_number: str = Field(..., min_length=1, max_length=20)
    current_block: str = Field(..., min_length=1, max_length=10)
    priority: int = Field(2, ge=1, le=4)
    delay_minutes: float = Field(0, ge=0, le=180)
    speed_kmph: float = Field(60, ge=0, le=160)
    status: str = Field("on_time", max_length=20)
    direction: Literal["up", "down"] = "up"
    requested_platform: Optional[str] = Field(None, max_length=10)

    @field_validator("current_block")
    @classmethod
    def validate_opt_block(cls, v: str) -> str:
        if v not in VALID_BLOCKS:
            raise ValueError(f"current_block must be one of {sorted(VALID_BLOCKS)}")
        return v


class OptimizationConstraintInput(BaseModel):
    headway_seconds: int = Field(240, ge=60, le=1200)
    line_capacity: int = Field(10, ge=1, le=24)
    platform_capacity: int = Field(4, ge=1, le=12)
    maintenance_blocks: list[str] = Field(default_factory=list)
    weather_factor: float = Field(1.0, ge=1.0, le=2.0)
    gradient_penalty: float = Field(0.08, ge=0, le=1)
    signal_spacing_penalty: float = Field(0.16, ge=0, le=1)
    loop_availability: dict[str, int] = Field(default_factory=dict)

    @field_validator("maintenance_blocks")
    @classmethod
    def validate_maintenance_blocks(cls, blocks: list[str]) -> list[str]:
        invalid = [block for block in blocks if block not in VALID_BLOCKS]
        if invalid:
            raise ValueError(f"maintenance_blocks contains invalid blocks: {invalid}")
        return blocks


class OptimizationRequest(BaseModel):
    section_id: str = Field("NDLS-GZB", min_length=1, max_length=40)
    trains: list[OptimizationTrainInput] = Field(..., min_length=1, max_length=24)
    constraints: OptimizationConstraintInput = Field(default_factory=OptimizationConstraintInput)


class ScenarioConfig(BaseModel):
    target_train: Optional[str] = Field(None, max_length=20)
    hold_minutes: float = Field(0, ge=0, le=30)
    reroute_train: Optional[str] = Field(None, max_length=20)
    maintenance_blocks: list[str] = Field(default_factory=list)
    weather_factor: Optional[float] = Field(None, ge=1.0, le=2.0)
    platform_override: dict[str, str] = Field(default_factory=dict)


class ScenarioSimulationRequest(BaseModel):
    section_id: str = Field("NDLS-GZB", min_length=1, max_length=40)
    trains: list[OptimizationTrainInput] = Field(..., min_length=1, max_length=24)
    constraints: OptimizationConstraintInput = Field(default_factory=OptimizationConstraintInput)
    scenario: ScenarioConfig = Field(default_factory=ScenarioConfig)


class ControllerOverrideRequest(BaseModel):
    recommendation_id: str = Field(..., min_length=1, max_length=80)
    train_number: str = Field(..., min_length=1, max_length=20)
    block_id: str = Field(..., min_length=1, max_length=10)
    ai_action: str = Field(..., min_length=1, max_length=30)
    controller_action: str = Field(..., min_length=1, max_length=30)
    reason: str = Field(..., min_length=3, max_length=240)
    approved: bool = True
    expected_delay_delta: float = Field(0, ge=-180, le=180)

    @field_validator("block_id")
    @classmethod
    def validate_override_block(cls, v: str) -> str:
        if v not in VALID_BLOCKS:
            raise ValueError(f"block_id must be one of {sorted(VALID_BLOCKS)}")
        return v


# ── Timing helper ─────────────────────────────────────────────
def _record_time(key: str, elapsed_ms: float) -> None:
    times = _stats[key]
    times.append(elapsed_ms)
    if len(times) > 100:
        times.pop(0)
    _stats[f"avg_{key.replace('_times','_ms')}"] = round(
        sum(times) / len(times), 2
    )


# ── Health ────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    uptime = round(time.time() - (_stats["started_at"] or time.time()), 1)
    try:
        with open("models/rf_meta.json") as f:
            meta = json.load(f)
        model_ready = True
    except FileNotFoundError:
        meta = {}
        model_ready = False

    return {
        "status":     "TrackMind AI backend running ✅",
        "version":    "4.0.0",
        "model":      "RandomForestClassifier",
        "mlReady":    model_ready,
        "accuracy":   meta.get("accuracy"),
        "classes":    meta.get("classes", []),
        "uptime_sec": uptime,
    }


@app.get("/health", tags=["Health"])
def health():
    uptime = round(time.time() - (_stats["started_at"] or time.time()), 1)
    import os
    model_ready = os.path.exists("models/rf_model.pkl")
    return {
        "ok":          True,
        "model_ready": model_ready,
        "model_type":  "RandomForest",
        "uptime_sec":  uptime,
        "cache_size":  len(_cache),
        "errors":      _stats["errors"],
    }


@app.get("/model-info", tags=["Health"])
def model_info():
    try:
        with open("models/rf_meta.json") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model not trained yet. Run train_rf.py first.")


# ── Stats ─────────────────────────────────────────────────────
@app.get("/stats", tags=["Monitoring"])
def get_stats():
    uptime = round(time.time() - (_stats["started_at"] or time.time()), 1)
    return {
        "uptime_sec":         uptime,
        "total_predictions":  _stats["total_predictions"],
        "total_conflicts":    _stats["total_conflicts"],
        "total_batch_calls":  _stats["total_batch_calls"],
        "avg_prediction_ms":  _stats["avg_prediction_ms"],
        "avg_conflict_ms":    _stats["avg_conflict_ms"],
        "errors":             _stats["errors"],
        "cache_size":         len(_cache),
    }


# ── RF Delay Prediction ───────────────────────────────────────
@app.post("/predict-delay", tags=["Prediction"],
          dependencies=[Depends(rate_limit)])
def predict_delay_endpoint(req: PredictRequest):
    cache_key = f"pred:{req.train_number}:{req.station_code}"
    cached = cache_get(cache_key)
    if cached:
        return {**cached, "cached": True}

    t0 = time.perf_counter()
    try:
        result = rf_predict(req.train_number, req.station_code)

        if result.get("delay_class") == "UNKNOWN":
            raise HTTPException(status_code=404, detail=result.get("error"))

        explanation = explain_prediction({
            "mode":          "delay",
            "train_number":  req.train_number,
            "station_code":  req.station_code,
            "delay_class":   result["delay_class"],
            "confidence":    result["confidence"],
        })

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        _stats["total_predictions"] += 1
        _record_time("prediction_times", elapsed_ms)

        response = {
            **result,
            "explanation": explanation,
            "latency_ms":  elapsed_ms,
            "cached":      False,
        }
        cache_set(cache_key, response)

        log.info(
            f"[predict] {req.train_number}@{req.station_code} → "
            f"{result['delay_class']} "
            f"(conf={result['confidence']}%, {elapsed_ms}ms)"
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        _stats["errors"] += 1
        log.error(f"[predict] {req.train_number} failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── Batch Prediction ──────────────────────────────────────────
@app.post("/predict-delay/batch", tags=["Prediction"],
          dependencies=[Depends(rate_limit)])
def predict_delay_batch(body: BatchPredictRequest):
    if len(body.requests) > 200:
        raise HTTPException(
            status_code=422,
            detail="Batch size limit is 200 trains per request"
        )

    t0 = time.perf_counter()
    try:
        results = []
        for req in body.requests:
            result = rf_predict(req.train_number, req.station_code)
            results.append(result)

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        _stats["total_batch_calls"] += 1
        _stats["total_predictions"] += len(body.requests)

        log.info(f"[batch] {len(body.requests)} trains predicted in {elapsed_ms}ms")
        return {
            "predictions": results,
            "count":       len(results),
            "latency_ms":  elapsed_ms,
        }

    except Exception as e:
        _stats["errors"] += 1
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict-delay/live-batch", tags=["Prediction"],
          dependencies=[Depends(rate_limit)])
def predict_delay_live_batch(body: LiveBatchPredictRequest):
    t0 = time.perf_counter()
    try:
        predictions = []
        for req in body.requests:
            inferred = infer_station_from_block(
                req.train_number,
                req.current_block,
                req.from_station,
                req.to_station,
            )
            if not inferred:
                predictions.append({
                    "train_number": req.train_number,
                    "station_code": req.current_block,
                    "delay_class": "UNKNOWN",
                    "confidence": 0,
                    "average_delay_minutes": None,
                    "matched_on": "route_missing",
                    "explanation": {
                        "predicted_class": "UNKNOWN",
                        "top_factor": "route_missing",
                        "shap_values": {},
                        "reason": "No historical route found for this train."
                    },
                    "cached": False,
                })
                continue

            result = rf_predict(req.train_number, inferred["station_code"])
            explanation = explain_prediction({
                "mode": "delay",
                "train_number": req.train_number,
                "station_code": inferred["station_code"],
                "delay_class": result["delay_class"],
                "confidence": result["confidence"],
            })
            predictions.append({
                **result,
                "station_name": inferred["station_name"],
                "current_block": req.current_block,
                "explanation": explanation,
                "cached": False,
            })

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        _stats["total_batch_calls"] += 1
        _stats["total_predictions"] += len(predictions)
        return {
            "predictions": predictions,
            "count": len(predictions),
            "latency_ms": elapsed_ms,
        }
    except Exception as e:
        _stats["errors"] += 1
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/train-route/{train_number}", tags=["Prediction"])
def train_route(train_number: str):
    try:
        route = get_train_route(train_number)
        if not route:
            raise HTTPException(status_code=404, detail=f"No route found for train {train_number}")
        return {
            "train_number": train_number,
            "route": route,
            "count": len(route),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── MILP Conflict Resolution ──────────────────────────────────
@app.post("/resolve-conflict", tags=["Conflict"],
          dependencies=[Depends(rate_limit)])
def resolve_conflict(conflict: ConflictInput):
    cache_key = (
        f"conflict:{conflict.trainA}:{conflict.trainB}:"
        f"{conflict.blockId}:{conflict.severity}"
    )
    cached = cache_get(cache_key)
    if cached:
        return {**cached, "cached": True}

    t0 = time.perf_counter()
    try:
        result = solver.resolve(conflict.model_dump())

        explanation = explain_prediction({
            "mode":           "conflict",
            "trainA":         conflict.trainA,
            "trainB":         conflict.trainB,
            "severity":       conflict.severity,
            "blockId":        conflict.blockId,
            "resolvedAction": result.get("resolvedAction", "unknown"),
        })

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        _stats["total_conflicts"] += 1
        _record_time("conflict_times", elapsed_ms)

        response = {
            **result,
            "explanation": explanation,
            "latency_ms":  elapsed_ms,
            "cached":      False,
        }
        cache_set(cache_key, response)

        log.info(
            f"[conflict] {conflict.trainA}↔{conflict.trainB} "
            f"at {conflict.blockId} ({conflict.severity}) → "
            f"{result.get('resolvedAction','?')} ({elapsed_ms}ms)"
        )
        return response

    except Exception as e:
        _stats["errors"] += 1
        log.error(f"[conflict] {conflict.trainA}↔{conflict.trainB} failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/optimize-section", tags=["Optimization"],
          dependencies=[Depends(rate_limit)])
def optimize_section(body: OptimizationRequest):
    t0 = time.perf_counter()
    try:
        result = solver.optimize_section(body.model_dump())
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            **result,
            "latency_ms": elapsed_ms,
        }
    except Exception as e:
        _stats["errors"] += 1
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simulate-scenario", tags=["Optimization"],
          dependencies=[Depends(rate_limit)])
def simulate_scenario(body: ScenarioSimulationRequest):
    t0 = time.perf_counter()
    try:
        result = solver.simulate_scenario(body.model_dump())
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            **result,
            "latency_ms": elapsed_ms,
        }
    except Exception as e:
        _stats["errors"] += 1
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/integration-sources", tags=["Optimization"])
def integration_sources():
    try:
        return solver.get_integration_blueprint()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/controller-override", tags=["Optimization"],
          dependencies=[Depends(rate_limit)])
def controller_override(body: ControllerOverrideRequest):
    entry = {
        **body.model_dump(),
        "timestamp": round(time.time() * 1000),
    }
    _override_audit.insert(0, entry)
    del _override_audit[50:]
    return {
        "status": "logged",
        "entry": entry,
        "count": len(_override_audit),
    }


@app.get("/controller-overrides", tags=["Optimization"])
def controller_overrides(limit: int = 20):
    return {
        "entries": _override_audit[: max(1, min(limit, 50))],
        "count": len(_override_audit),
    }


# ── New RF-powered routes ─────────────────────────────────────
@app.get("/top-delayed", tags=["Analytics"])
def top_delayed(limit: int = 10):
    """Returns top N most delayed trains from the dataset."""
    if limit > 50:
        raise HTTPException(status_code=422, detail="limit max is 50")
    try:
        return {"trains": get_top_delayed_trains(limit), "count": limit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/station-stats/{station_code}", tags=["Analytics"])
def station_stats(station_code: str):
    """Returns aggregated delay stats for a station."""
    try:
        result = get_station_stats(station_code.upper())
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Global exception handler ──────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    _stats["errors"] += 1
    log.error(f"Unhandled error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "path": str(request.url)},
    )
