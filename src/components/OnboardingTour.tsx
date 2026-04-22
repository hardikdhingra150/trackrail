import { useEffect, useRef, useState } from "react";

interface Step {
  target:  string;
  title:   string;
  content: string;
  icon:    string;
}

const STEPS: Step[] = [
  {
    target:  "kpi",
    icon:    "📊",
    title:   "KPI Overview",
    content: "6 live metric cards updated every 8s: Active Trains in section, Avg Delay per train (min), On-Time % of trains on schedule, Open Conflicts needing action, Critical Trains with delay >10 min, and total Delay Saved by AI recommendations.",
  },
  {
    target:  "blockmap",
    icon:    "🗺️",
    title:   "Live Train Block Map",
    content: "Real-time positions of all trains across blocks B1–B12 on Section NDLS→GZB. Green = on-time, orange = delayed, red = critical. Conflict zones show a ⚠️ warning icon. Hover any train for speed, delay minutes, and block details.",
  },
  {
    target:  "trainpanel",
    icon:    "🚂",
    title:   "Train Panel",
    content: "Live table of all 8 active trains — current block, next block, speed (km/h), delay (min), priority class, and LSTM-predicted delay with AI confidence %. Critical trains (delay >10 min) are highlighted in red.",
  },
  {
    target:  "conflictpanel",
    icon:    "⚠️",
    title:   "Conflict Panel",
    content: "Auto-detected conflicts where two trains converge on the same block. Each entry shows Train A vs Train B, the block ID, severity (high/medium/low based on priority), and status (open/resolved). Conflicts auto-resolve after 3 minutes.",
  },
  {
    target:  "recommendations",
    icon:    "🤖",
    title:   "AI Recommendations",
    content: "MILP + RL engine generates 3 ranked actions per conflict — HOLD (best), SLOW, and REROUTE — each showing AI confidence %, estimated minutes saved, and affected train count. Click ✓ Apply to execute; ✕ sends negative feedback to retrain the RL agent.",
  },
  {
    target:  "simtoggle",
    icon:    "⚙️",
    title:   "Simulation Engine",
    content: "LSTM + MILP engine ticks every 8s. Trains advance through blocks based on priority — Rajdhani (P1) moves fastest, Mail (P2) moderate, Passenger (P3) slowest. Press Space or click Pause Sim to freeze live updates and inspect the current state.",
  },
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [pos,  setPos]  = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [side, setSide] = useState<"bottom" | "top" | "left" | "right">("bottom");
  const overlayRef      = useRef<HTMLDivElement>(null);

  const current = STEPS[step];

  // ── Position tooltip next to target element ──────────────
  useEffect(() => {
    const target = document.querySelector(`[data-tour="${current.target}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    // Small delay so scrollIntoView settles before measuring
    const t = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const vw   = window.innerWidth;
      const vh   = window.innerHeight;

      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const spaceRight = vw - rect.right;

      let chosenSide: typeof side = "bottom";
      if (spaceBelow < 200 && spaceAbove > 200) chosenSide = "top";
      else if (spaceRight < 360)                chosenSide = "left";

      setSide(chosenSide);
      setPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }, 120);

    return () => clearTimeout(t);
  }, [step]);

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onComplete();
  };
  const handleBack = () => setStep((s) => Math.max(0, s - 1));
  const handleSkip = () => onComplete();

  // ── Tooltip positioning ───────────────────────────────────
  const TOOLTIP_W = 340;
  const TOOLTIP_H = 190;
  const GAP       = 16;

  let tooltipStyle: React.CSSProperties = {};
  const centerX = Math.min(
    Math.max(pos.left + pos.width / 2 - TOOLTIP_W / 2, 12),
    window.innerWidth - TOOLTIP_W - 12,
  );

  if (side === "bottom") {
    tooltipStyle = { top: pos.top + pos.height + GAP + window.scrollY, left: centerX };
  } else if (side === "top") {
    tooltipStyle = { top: pos.top - TOOLTIP_H - GAP + window.scrollY, left: centerX };
  } else if (side === "left") {
    tooltipStyle = {
      top:  pos.top + pos.height / 2 - TOOLTIP_H / 2 + window.scrollY,
      left: Math.max(pos.left - TOOLTIP_W - GAP, 12),
    };
  } else {
    tooltipStyle = {
      top:  pos.top + pos.height / 2 - TOOLTIP_H / 2 + window.scrollY,
      left: pos.left + pos.width + GAP,
    };
  }

  // Progress percentage for thin bar
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {/* Dark backdrop */}
      <div
        ref={overlayRef}
        onClick={handleSkip}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Highlight ring */}
      <div style={{
        position:      "fixed",
        top:           pos.top  - 6,
        left:          pos.left - 6,
        width:         pos.width  + 12,
        height:        pos.height + 12,
        borderRadius:  14,
        border:        "2px solid rgba(167,139,250,0.8)",
        boxShadow:     "0 0 0 4px rgba(167,139,250,0.15), 0 0 32px rgba(167,139,250,0.35)",
        zIndex:        9999,
        pointerEvents: "none",
        transition:    "all 0.35s cubic-bezier(0.16,1,0.3,1)",
      }} />

      {/* Tooltip card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position:     "absolute",
          ...tooltipStyle,
          width:        TOOLTIP_W,
          zIndex:       10000,
          background:   "#ffffff",
          borderRadius: 18,
          padding:      "0 0 18px",
          boxShadow:    "0 28px 72px rgba(0,0,0,0.55)",
          overflow:     "hidden",
          transition:   "all 0.35s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Progress bar — top */}
        <div style={{ height: 3, background: "rgba(0,0,0,0.07)" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, #6d28d9, #8b5cf6)",
            transition: "width 0.4s ease",
            borderRadius: "0 99px 99px 0",
          }} />
        </div>

        <div style={{ padding: "18px 22px 0" }}>
          {/* Close X */}
          <button
            onClick={handleSkip}
            style={{
              position: "absolute", top: 14, right: 14,
              background: "rgba(0,0,0,0.05)", border: "none", cursor: "pointer",
              color: "rgba(0,0,0,0.35)", fontSize: 14, lineHeight: 1,
              width: 26, height: 26, borderRadius: 8,
              display: "grid", placeItems: "center",
            }}
            title="Skip tour"
          >×</button>

          {/* Icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, fontSize: 18,
              background: "linear-gradient(135deg, rgba(109,40,217,0.1), rgba(139,92,246,0.15))",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              {current.icon}
            </div>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0, lineHeight: 1.2 }}>
              {current.title}
            </h4>
          </div>

          {/* Description */}
          <p style={{
            fontSize: 12.5, color: "#555", lineHeight: 1.6,
            margin: "0 0 18px", letterSpacing: "0.01em",
          }}>
            {current.content}
          </p>

          {/* Footer row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.28)", fontWeight: 600 }}>
              {step + 1} / {STEPS.length}
            </span>
            <div style={{ display: "flex", gap: 7 }}>
              {step > 0 && (
                <button
                  onClick={handleBack}
                  style={{
                    fontSize: 12, fontWeight: 600,
                    padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                    background: "none",
                    border: "1px solid rgba(0,0,0,0.15)",
                    color: "#444",
                  }}
                >← Back</button>
              )}
              <button
                onClick={handleNext}
                style={{
                  fontSize: 12, fontWeight: 700,
                  padding: "6px 18px", borderRadius: 8, cursor: "pointer",
                  background: step === STEPS.length - 1
                    ? "linear-gradient(135deg,#111,#333)"
                    : "linear-gradient(135deg,#6d28d9,#7c3aed)",
                  border: "none", color: "#fff",
                  boxShadow: "0 2px 10px rgba(109,40,217,0.35)",
                }}
              >
                {step === STEPS.length - 1 ? "Get started ✓" : "Next →"}
              </button>
            </div>
          </div>

          {/* Dot indicators */}
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 14 }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                title={STEPS[i].title}
                style={{
                  width:  i === step ? 20 : 6,
                  height: 6, borderRadius: 99,
                  border: "none", cursor: "pointer", padding: 0,
                  background: i === step
                    ? "linear-gradient(90deg,#6d28d9,#8b5cf6)"
                    : i < step
                    ? "rgba(109,40,217,0.35)"
                    : "rgba(0,0,0,0.12)",
                  transition: "all 0.25s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}