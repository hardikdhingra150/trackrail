import { useCallback, useEffect, useMemo, useState } from "react";
import { getControllerOverrides, getIntegrationSources, optimizeSection, saveControllerOverride, simulateScenario } from "../lib/api";
import { useToast } from "./ToastProvider";
import type {
  ControllerOverrideEntry,
  DelayPrediction,
  FirestoreTrain,
  IntegrationBlueprint,
  OptimizationConstraints,
  OptimizationTrainInput,
  SectionOptimizationResult,
  ScenarioSimulationResult,
} from "../types";

interface OptimizationStudioProps {
  liveTrains: FirestoreTrain[];
  delays: DelayPrediction[];
}

const blocks = Array.from({ length: 12 }, (_, index) => `B${index + 1}`);

const defaultConstraints: OptimizationConstraints = {
  headway_seconds: 240,
  line_capacity: 10,
  platform_capacity: 4,
  maintenance_blocks: [],
  weather_factor: 1,
  gradient_penalty: 0.08,
  signal_spacing_penalty: 0.16,
  loop_availability: Object.fromEntries(blocks.map((block) => [block, block === "B6" || block === "B7" ? 2 : 1])),
};

const PREVIEW_COUNT = 3;

function cardStyle(strong = false): React.CSSProperties {
  return {
    background: strong ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    backdropFilter: "blur(18px)",
  };
}

function numberInputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    color: "#fff",
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
  };
}

function formatActionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildLocalSimulationFallback(
  optimization: SectionOptimizationResult,
  scenario: {
    hold_minutes: number;
    reroute_train?: string;
    maintenance_blocks: string[];
    weather_factor?: number;
  },
): ScenarioSimulationResult {
  const weatherDelta = (scenario.weather_factor ?? 1) - optimization.constraint_snapshot.weather_factor;
  const rerouteBonus = scenario.reroute_train ? 0.8 : 0;
  const maintenancePenalty = scenario.maintenance_blocks.length * 0.6;
  const holdPenalty = scenario.hold_minutes / 10;

  const throughputDelta = Number((rerouteBonus - holdPenalty - maintenancePenalty - weatherDelta * 1.6).toFixed(1));
  const travelTimeDelta = Number((rerouteBonus * 1.4 - scenario.hold_minutes * 0.35 - maintenancePenalty - weatherDelta * 2.2).toFixed(1));
  const objectiveDelta = Number((throughputDelta * 9 + travelTimeDelta * 5).toFixed(1));
  const conflictDelta = Math.round(Math.max(-2, maintenancePenalty + weatherDelta * 2 - rerouteBonus));

  const scenarioThroughput = Number((optimization.throughput_trains_per_hour + throughputDelta).toFixed(1));
  const scenarioTravel = Number((optimization.average_travel_time_reduction_min + travelTimeDelta).toFixed(1));

  return {
    baseline: {
      ...optimization,
    },
    scenario: {
      ...optimization,
      objective_score: Number((optimization.objective_score + objectiveDelta).toFixed(1)),
      throughput_trains_per_hour: scenarioThroughput,
      average_travel_time_reduction_min: scenarioTravel,
      kpis: {
        ...optimization.kpis,
        active_conflicts: Math.max(0, optimization.kpis.active_conflicts + conflictDelta),
      },
    },
    delta: {
      throughput_delta: throughputDelta,
      travel_time_reduction_delta: travelTimeDelta,
      objective_delta: objectiveDelta,
      conflict_delta: conflictDelta,
    },
    latency_ms: 0,
  };
}

export default function OptimizationStudio({ liveTrains, delays }: OptimizationStudioProps) {
  const { showToast } = useToast();
  const [constraints, setConstraints] = useState<OptimizationConstraints>(defaultConstraints);
  const [optimization, setOptimization] = useState<SectionOptimizationResult | null>(null);
  const [simulation, setSimulation] = useState<ScenarioSimulationResult | null>(null);
  const [integration, setIntegration] = useState<IntegrationBlueprint | null>(null);
  const [auditTrail, setAuditTrail] = useState<ControllerOverrideEntry[]>([]);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [loadingOptimization, setLoadingOptimization] = useState(false);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { action: string; reason: string }>>({});
  const [showAllPrecedence, setShowAllPrecedence] = useState(false);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [showAllOverrides, setShowAllOverrides] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [scenarioTarget, setScenarioTarget] = useState("");
  const [scenarioHold, setScenarioHold] = useState(4);
  const [scenarioReroute, setScenarioReroute] = useState("");
  const [scenarioWeather, setScenarioWeather] = useState(1.1);
  const [scenarioMaintenance, setScenarioMaintenance] = useState("B7");

  const optimizerTrains = useMemo<OptimizationTrainInput[]>(() => {
    const delayLookup = new Map(delays.map((delay) => [delay.train_number, delay]));
    return liveTrains
      .slice()
      .sort((left, right) => {
        if (left.currentBlock === right.currentBlock) return right.delayMinutes - left.delayMinutes;
        return Number(left.currentBlock.replace("B", "")) - Number(right.currentBlock.replace("B", ""));
      })
      .slice(0, 12)
      .map((train, index) => {
        const prediction = delayLookup.get(train.trainNumber);
        const derivedPriority = Math.min(4, Math.max(1, train.priority || (train.status === "critical" ? 1 : 2)));
        return {
          train_number: train.trainNumber,
          current_block: train.currentBlock || "B1",
          priority: derivedPriority,
          delay_minutes: Math.max(train.delayMinutes, prediction?.average_delay_minutes ?? 0),
          speed_kmph: Math.max(0, train.speed),
          status: train.status,
          direction: index % 2 === 0 ? "up" : "down",
          requested_platform: `PF-${(index % constraints.platform_capacity) + 1}`,
        };
      });
  }, [liveTrains, delays, constraints.platform_capacity]);

  const loadAuditTrail = useCallback(async () => {
    try {
      const response = await getControllerOverrides(20);
      setAuditTrail(response.entries);
    } catch (error) {
      console.error("controller-overrides failed", error);
    }
  }, []);

  const runOptimization = useCallback(async () => {
    if (optimizerTrains.length === 0) return;
    setLoadingOptimization(true);
    try {
      const result = await optimizeSection({
        section_id: "NDLS-GZB",
        trains: optimizerTrains,
        constraints,
      });
      setOptimization(result);
      showToast("Optimization updated", "success", `Objective ${result.objective_score} · throughput ${result.throughput_trains_per_hour} tph`);
    } catch (error) {
      console.error(error);
      showToast("Optimizer offline", "error", error instanceof Error ? error.message : "Could not compute corridor plan");
    } finally {
      setLoadingOptimization(false);
    }
  }, [optimizerTrains, constraints, showToast]);

  const runSimulation = useCallback(async () => {
    if (optimizerTrains.length === 0) return;
    setLoadingSimulation(true);
    setSimulationError(null);
    try {
      const result = await simulateScenario({
        section_id: "NDLS-GZB",
        trains: optimizerTrains,
        constraints,
        scenario: {
          target_train: scenarioTarget || undefined,
          hold_minutes: scenarioHold,
          reroute_train: scenarioReroute || undefined,
          maintenance_blocks: scenarioMaintenance ? [scenarioMaintenance] : [],
          weather_factor: scenarioWeather,
          platform_override: scenarioTarget ? { [scenarioTarget]: "PF-1" } : {},
        },
      });
      setSimulation(result);
      showToast(
        "Scenario simulated",
        "info",
        `Objective Δ ${result.delta.objective_delta >= 0 ? "+" : ""}${result.delta.objective_delta}`
      );
    } catch (error) {
      console.error(error);
      if (optimization) {
        const fallback = buildLocalSimulationFallback(optimization, {
          hold_minutes: scenarioHold,
          reroute_train: scenarioReroute || undefined,
          maintenance_blocks: scenarioMaintenance ? [scenarioMaintenance] : [],
          weather_factor: scenarioWeather,
        });
        setSimulation(fallback);
        setSimulationError("Live simulation API unavailable — showing local estimated scenario impact.");
        showToast("Scenario estimated locally", "info", "Backend simulation was unavailable, so the UI used a local what-if estimate.");
      } else {
        setSimulationError(error instanceof Error ? error.message : "Could not run simulation");
        showToast("Scenario failed", "error", error instanceof Error ? error.message : "Could not run simulation");
      }
    } finally {
      setLoadingSimulation(false);
    }
  }, [optimizerTrains, constraints, scenarioTarget, scenarioHold, scenarioReroute, scenarioMaintenance, scenarioWeather, showToast, optimization]);

  useEffect(() => {
    getIntegrationSources().then(setIntegration).catch((error) => {
      console.error("integration-sources failed", error);
    });
    loadAuditTrail();
  }, [loadAuditTrail]);

  useEffect(() => {
    if (optimizerTrains.length > 0) {
      void runOptimization();
    }
  }, [optimizerTrains.length, runOptimization]);

  const submitOverride = async (
    recommendationId: string,
    trainNumber: string,
    blockId: string,
    aiAction: string,
    expectedDelayDelta: number,
  ) => {
    const draft = overrideDrafts[recommendationId] ?? { action: aiAction, reason: "" };
    if (!draft.reason.trim()) {
      showToast("Reason required", "error", "Explain why the controller changed or approved the AI action");
      return;
    }
    try {
      await saveControllerOverride({
        recommendation_id: recommendationId,
        train_number: trainNumber,
        block_id: blockId,
        ai_action: aiAction,
        controller_action: draft.action,
        reason: draft.reason.trim(),
        approved: draft.action === aiAction,
        expected_delay_delta: expectedDelayDelta,
      });
      showToast("Override logged", "success", `${trainNumber} · ${formatActionLabel(draft.action)} saved in audit trail`);
      setOverrideDrafts((prev) => ({
        ...prev,
        [recommendationId]: { action: aiAction, reason: "" },
      }));
      await loadAuditTrail();
    } catch (error) {
      console.error(error);
      showToast("Override failed", "error", error instanceof Error ? error.message : "Could not save controller decision");
    }
  };

  const visiblePrecedence = showAllPrecedence
    ? optimization?.precedence_plan ?? []
    : (optimization?.precedence_plan ?? []).slice(0, PREVIEW_COUNT);
  const hiddenPrecedenceCount = Math.max(0, (optimization?.precedence_plan.length ?? 0) - PREVIEW_COUNT);

  const visiblePlatforms = showAllPlatforms
    ? optimization?.platform_plan ?? []
    : (optimization?.platform_plan ?? []).slice(0, PREVIEW_COUNT + 1);
  const hiddenPlatformCount = Math.max(0, (optimization?.platform_plan.length ?? 0) - (PREVIEW_COUNT + 1));

  const visibleRecommendations = showAllOverrides
    ? optimization?.recommendations ?? []
    : (optimization?.recommendations ?? []).slice(0, PREVIEW_COUNT);
  const hiddenRecommendationCount = Math.max(0, (optimization?.recommendations.length ?? 0) - PREVIEW_COUNT);

  const visibleSources = showAllSources
    ? integration?.sources ?? []
    : (integration?.sources ?? []).slice(0, PREVIEW_COUNT);
  const hiddenSourceCount = Math.max(0, (integration?.sources.length ?? 0) - PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-5">
      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-5">
        <section style={cardStyle(true)}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">Optimization Studio</p>
              <h2 className="text-xl font-extrabold text-white mt-1">Constraint-aware section control</h2>
              <p className="text-sm text-white/45 mt-2 max-w-[760px]">
                Explicitly model headway, line capacity, loop availability, maintenance blocks, signalling pressure, and platform occupancy before deciding train precedence or crossings.
              </p>
            </div>
            <button
              onClick={runOptimization}
              disabled={loadingOptimization}
              className="rounded-xl px-4 py-2 text-sm font-bold text-black"
              style={{ background: "#fbbf24", opacity: loadingOptimization ? 0.6 : 1 }}
            >
              {loadingOptimization ? "Running…" : "Re-optimize section"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              { label: "Objective", value: optimization?.objective_score ?? "—", sub: "weighted throughput score" },
              { label: "Throughput", value: optimization ? `${optimization.throughput_trains_per_hour} tph` : "—", sub: "section trains per hour" },
              { label: "Travel Time Gain", value: optimization ? `${optimization.average_travel_time_reduction_min} min` : "—", sub: "average reduction" },
              { label: "Conflict Free", value: optimization?.conflict_free ? "YES" : "NO", sub: "latest corridor plan" },
            ].map((item) => (
              <div key={item.label} style={cardStyle()}>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold">{item.label}</p>
                <p className="text-2xl font-black text-white mt-2">{item.value}</p>
                <p className="text-xs text-white/35 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Headway (seconds)</span>
              <input
                style={numberInputStyle()}
                type="number"
                value={constraints.headway_seconds}
                onChange={(event) => setConstraints((prev) => ({ ...prev, headway_seconds: Number(event.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Line capacity (tph)</span>
              <input
                style={numberInputStyle()}
                type="number"
                value={constraints.line_capacity}
                onChange={(event) => setConstraints((prev) => ({ ...prev, line_capacity: Number(event.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Platform capacity</span>
              <input
                style={numberInputStyle()}
                type="number"
                value={constraints.platform_capacity}
                onChange={(event) => setConstraints((prev) => ({ ...prev, platform_capacity: Number(event.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Weather factor</span>
              <input
                style={numberInputStyle()}
                type="number"
                step="0.05"
                value={constraints.weather_factor}
                onChange={(event) => setConstraints((prev) => ({ ...prev, weather_factor: Number(event.target.value) }))}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {blocks.map((block) => {
              const active = constraints.maintenance_blocks.includes(block);
              return (
                <button
                  key={block}
                  onClick={() => setConstraints((prev) => ({
                    ...prev,
                    maintenance_blocks: active
                      ? prev.maintenance_blocks.filter((item) => item !== block)
                      : [...prev.maintenance_blocks, block],
                  }))}
                  className="rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{
                    background: active ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)",
                    border: active ? "1px solid rgba(248,113,113,0.24)" : "1px solid rgba(255,255,255,0.08)",
                    color: active ? "#f87171" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {block} {active ? "block" : "free"}
                </button>
              );
            })}
          </div>
        </section>

        <section style={cardStyle(true)}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">What-if Simulation</p>
              <h3 className="text-lg font-extrabold text-white mt-1">Test alternate controller moves</h3>
              <p className="text-sm text-white/45 mt-2">
                Hold, reroute, maintenance, platform override, and weather severity can be changed live to compare throughput, travel time, and conflict count before the controller commits.
              </p>
            </div>
            <button
              onClick={runSimulation}
              disabled={loadingSimulation}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.24)" }}
            >
              {loadingSimulation ? "Simulating…" : "Run what-if"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Target train</span>
              <select style={numberInputStyle()} value={scenarioTarget} onChange={(event) => setScenarioTarget(event.target.value)}>
                <option value="">Select</option>
                {optimizerTrains.map((train) => (
                  <option key={train.train_number} value={train.train_number}>{train.train_number}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Hold minutes</span>
              <input style={numberInputStyle()} type="number" value={scenarioHold} onChange={(event) => setScenarioHold(Number(event.target.value))} />
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Reroute train</span>
              <select style={numberInputStyle()} value={scenarioReroute} onChange={(event) => setScenarioReroute(event.target.value)}>
                <option value="">None</option>
                {optimizerTrains.map((train) => (
                  <option key={train.train_number} value={train.train_number}>{train.train_number}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-white/45 font-semibold">Maintenance block</span>
              <select style={numberInputStyle()} value={scenarioMaintenance} onChange={(event) => setScenarioMaintenance(event.target.value)}>
                {blocks.map((block) => (
                  <option key={block} value={block}>{block}</option>
                ))}
              </select>
            </label>
          </div>

          {simulationError && (
            <div className="mt-4 rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.18)",
                color: "#fcd34d",
              }}>
              {simulationError}
            </div>
          )}

          <div className="mt-4">
            <span className="text-xs text-white/45 font-semibold">Weather factor</span>
            <input
              type="range"
              min="1"
              max="1.8"
              step="0.05"
              value={scenarioWeather}
              onChange={(event) => setScenarioWeather(Number(event.target.value))}
              className="w-full mt-2"
            />
            <div className="text-xs text-white/35 mt-1">{scenarioWeather.toFixed(2)}x disruption severity</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            {[
              { label: "Throughput Δ", value: simulation ? `${simulation.delta.throughput_delta >= 0 ? "+" : ""}${simulation.delta.throughput_delta} tph` : "—" },
              { label: "Travel Time Δ", value: simulation ? `${simulation.delta.travel_time_reduction_delta >= 0 ? "+" : ""}${simulation.delta.travel_time_reduction_delta} min` : "—" },
              { label: "Objective Δ", value: simulation ? `${simulation.delta.objective_delta >= 0 ? "+" : ""}${simulation.delta.objective_delta}` : "—" },
              { label: "Conflict Δ", value: simulation ? `${simulation.delta.conflict_delta >= 0 ? "+" : ""}${simulation.delta.conflict_delta}` : "—" },
            ].map((item) => (
              <div key={item.label} style={cardStyle()}>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold">{item.label}</p>
                <p className="text-xl font-black text-white mt-2">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
        <section style={cardStyle()}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">Precedence & Crossing Engine</p>
              <h3 className="text-lg font-extrabold text-white mt-1">Recommended controller sequence</h3>
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-bold text-emerald-300" style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.22)" }}>
              {optimization?.kpis.active_conflicts ?? 0} active conflicts
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <div style={cardStyle()}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-bold text-white">Precedence order</p>
                {hiddenPrecedenceCount > 0 && (
                  <button
                    onClick={() => setShowAllPrecedence((prev) => !prev)}
                    className="rounded-full px-3 py-1 text-[11px] font-bold"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                  >
                    {showAllPrecedence ? "Collapse" : `View more +${hiddenPrecedenceCount}`}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {visiblePrecedence.map((item) => (
                  <div key={`${item.train_number}-${item.rank}`} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-white/45 uppercase tracking-[0.12em]">Rank {item.rank}</p>
                        <p className="text-base font-extrabold text-white mt-1">{item.train_number}</p>
                      </div>
                      <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", color: "#fbbf24" }}>
                        {formatActionLabel(item.action)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><span className="text-white/30">Block</span><p className="font-bold text-white mt-1">{item.current_block}</p></div>
                      <div><span className="text-white/30">Hold</span><p className="font-bold text-white mt-1">{item.hold_minutes} min</p></div>
                      <div><span className="text-white/30">Score</span><p className="font-bold text-white mt-1">{item.precedence_score}</p></div>
                    </div>
                    <p className="text-xs text-white/40 mt-3 leading-5">{item.reason}</p>
                  </div>
                )) ?? <p className="text-sm text-white/40">No optimization yet.</p>}
              </div>
            </div>

            <div style={cardStyle()}>
              <p className="text-sm font-bold text-white mb-3">Crossing & loop plan</p>
              <div className="space-y-3">
                {(optimization?.crossing_plan.length ?? 0) === 0 ? (
                  <div className="rounded-2xl p-4 text-sm text-emerald-300" style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.18)" }}>
                    Corridor currently conflict-free under modeled constraints.
                  </div>
                ) : (
                  optimization?.crossing_plan.map((item) => (
                    <div key={`${item.block_id}-${item.winner_train}`} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-white/35 font-bold">{item.block_id}</p>
                          <p className="text-base font-extrabold text-white mt-1">{item.winner_train} gets precedence</p>
                        </div>
                        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: item.loop_used ? "rgba(96,165,250,0.12)" : "rgba(248,113,113,0.12)", border: item.loop_used ? "1px solid rgba(96,165,250,0.24)" : "1px solid rgba(248,113,113,0.24)", color: item.loop_used ? "#60a5fa" : "#f87171" }}>
                          {item.loop_used ? "Loop available" : "Main line control"}
                        </span>
                      </div>
                      <p className="text-sm text-white/45 mt-3">Hold {item.held_trains.join(", ")} for {item.expected_spacing_minutes} minutes spacing.</p>
                      <p className="text-xs text-white/35 mt-2">{item.explanation}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section style={cardStyle()}>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">Platform Allocation</p>
          <h3 className="text-lg font-extrabold text-white mt-1">Operational platform optimizer</h3>
          <p className="text-sm text-white/45 mt-2">Shows the recommended platform assignment before the passenger-facing platform prediction layer consumes it.</p>

          <div className="flex items-center justify-between gap-3 mt-5 mb-3">
            <div className="text-xs text-white/35">
              Showing {Math.min(visiblePlatforms.length, optimization?.platform_plan.length ?? 0)} of {optimization?.platform_plan.length ?? 0} assignments
            </div>
            {hiddenPlatformCount > 0 && (
              <button
                onClick={() => setShowAllPlatforms((prev) => !prev)}
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
              >
                {showAllPlatforms ? "Collapse" : `View more +${hiddenPlatformCount}`}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {visiblePlatforms.map((item) => (
              <div key={`${item.train_number}-${item.assigned_platform}`} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-extrabold text-white">{item.train_number}</p>
                    <p className="text-xs text-white/35 mt-1">{item.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-amber-300">{item.assigned_platform}</p>
                    <p className="text-[11px] text-white/35 mt-1">load {item.occupancy_load}</p>
                  </div>
                </div>
              </div>
            )) ?? <p className="text-sm text-white/40 mt-4">No platform plan yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.12fr_0.88fr] gap-5">
        <section style={cardStyle()}>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">Controller Override Workflow</p>
          <h3 className="text-lg font-extrabold text-white mt-1">AI suggests → controller modifies → audit trail</h3>
          <div className="flex items-center justify-between gap-3 mt-4">
            <div className="text-xs text-white/35">
              Showing {Math.min(visibleRecommendations.length, optimization?.recommendations.length ?? 0)} of {optimization?.recommendations.length ?? 0} AI actions
            </div>
            {hiddenRecommendationCount > 0 && (
              <button
                onClick={() => setShowAllOverrides((prev) => !prev)}
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
              >
                {showAllOverrides ? "Collapse" : `View more +${hiddenRecommendationCount}`}
              </button>
            )}
          </div>
          <div className="space-y-4 mt-5">
            {visibleRecommendations.map((recommendation, index) => {
              const recommendationId = `${recommendation.train_number}-${recommendation.current_block}-${index}`;
              const draft = overrideDrafts[recommendationId] ?? {
                action: recommendation.action_type,
                reason: "",
              };
              return (
                <div key={recommendationId} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-white/35 font-bold">{recommendation.current_block}</p>
                      <p className="text-base font-extrabold text-white mt-1">{recommendation.train_number}</p>
                      <p className="text-sm text-white/45 mt-2">{recommendation.explanation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/30">AI action</p>
                      <p className="text-sm font-black text-amber-300 mt-1">{formatActionLabel(recommendation.action_type)}</p>
                      <p className="text-[11px] text-white/35 mt-1">{recommendation.confidence}% confidence</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_140px] gap-3 mt-4">
                    <select
                      style={numberInputStyle()}
                      value={draft.action}
                      onChange={(event) => setOverrideDrafts((prev) => ({
                        ...prev,
                        [recommendationId]: { ...draft, action: event.target.value },
                      }))}
                    >
                      {["PROCEED", "HOLD", "SLOW", "REROUTE", "PLATFORM_SWAP"].map((action) => (
                        <option key={action} value={action}>{formatActionLabel(action)}</option>
                      ))}
                    </select>
                    <input
                      style={numberInputStyle()}
                      value={draft.reason}
                      placeholder="Controller reason / operational note"
                      onChange={(event) => setOverrideDrafts((prev) => ({
                        ...prev,
                        [recommendationId]: { ...draft, reason: event.target.value },
                      }))}
                    />
                    <button
                      onClick={() => submitOverride(
                        recommendationId,
                        recommendation.train_number,
                        recommendation.current_block,
                        recommendation.action_type,
                        recommendation.estimated_delay_reduction_min,
                      )}
                      className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                      style={{ background: "rgba(74,222,128,0.14)", border: "1px solid rgba(74,222,128,0.24)" }}
                    >
                      Log final action
                    </button>
                  </div>
                </div>
              );
            }) ?? <p className="text-sm text-white/40 mt-4">Run optimization to generate controller choices.</p>}
          </div>
        </section>

        <section style={cardStyle()}>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/35">Audit & Integration Layer</p>
          <h3 className="text-lg font-extrabold text-white mt-1">API connectors, trust boundary, and recent decisions</h3>

          <div className="flex items-center justify-between gap-3 mt-5 mb-3">
            <div className="text-xs text-white/35">
              Showing {Math.min(visibleSources.length, integration?.sources.length ?? 0)} of {integration?.sources.length ?? 0} connected sources
            </div>
            {hiddenSourceCount > 0 && (
              <button
                onClick={() => setShowAllSources((prev) => !prev)}
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
              >
                {showAllSources ? "Collapse" : `View more +${hiddenSourceCount}`}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {visibleSources.map((source) => (
              <div key={source.name} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-white">{source.name}</p>
                    <p className="text-xs text-white/35 mt-1">{source.type} · {source.security}</p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: source.status === "READY" ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.12)", border: source.status === "READY" ? "1px solid rgba(74,222,128,0.24)" : "1px solid rgba(251,191,36,0.24)", color: source.status === "READY" ? "#4ade80" : "#fbbf24" }}>
                    {source.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {source.payloads.map((payload) => (
                    <span key={payload} className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/55" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {payload}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-white/30 mt-3">Latency budget {source.latency_ms} ms</p>
              </div>
            )) ?? <p className="text-sm text-white/40">Loading integration blueprint…</p>}
          </div>

          <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm font-extrabold text-white">Recent controller audit trail</p>
            <div className="space-y-3 mt-4">
              {auditTrail.length === 0 ? (
                <p className="text-sm text-white/40">No override logs yet. Log a final controller action to build the trail.</p>
              ) : (
                auditTrail.map((entry) => (
                  <div key={`${entry.recommendation_id}-${entry.timestamp}`} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{entry.train_number} · {entry.block_id}</p>
                        <p className="text-xs text-white/35 mt-1">
                          AI: {formatActionLabel(entry.ai_action)} → Controller: {formatActionLabel(entry.controller_action)}
                        </p>
                      </div>
                      <span className="text-[11px] text-white/30">
                        {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    </div>
                    <p className="text-xs text-white/45 mt-2">{entry.reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
