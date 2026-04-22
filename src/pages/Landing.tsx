import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";

// ── PURE MONOCHROME PALETTE ──
const C = {
  accent:     "#ffffff",
  accent2:    "#a0a0a0",
  glow:       "#e0e0e0",
  muted:      "rgba(255,255,255,0.58)",
  faint:      "rgba(255,255,255,0.28)",
  card:       "rgba(255,255,255,0.04)",
  border:     "rgba(255,255,255,0.1)",
  borderSoft: "rgba(255,255,255,0.06)",
  ctaBg:      "rgba(255,255,255,0.08)",
};

function Stat({ val, label }: { val: string; label: string }) {
  return (
    <div className="flex flex-col">
      <p className="text-5xl font-extrabold text-white mb-1">{val}</p>
      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{label}</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-3xl p-7 hover:-translate-y-1 transition-all duration-300 group"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        backdropFilter: "blur(24px)",
      }}
    >
      <div
        className="w-14 h-14 rounded-2xl grid place-items-center text-2xl mb-5 transition-all duration-300 group-hover:bg-white/10"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: `1px solid rgba(255,255,255,0.12)`,
        }}
      >
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 text-white">{title}</h3>
      <p className="text-[15px] leading-relaxed" style={{ color: C.muted }}>{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div
      className="flex gap-5 py-6 border-b"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="w-10 h-10 rounded-full grid place-items-center shrink-0 mt-0.5 font-extrabold text-sm text-black"
        style={{ background: "rgba(255,255,255,0.9)" }}
      >
        {n}
      </div>
      <div>
        <h4 className="text-lg font-bold mb-1 text-white">{title}</h4>
        <p className="text-[15px] leading-relaxed" style={{ color: C.muted }}>{desc}</p>
      </div>
    </div>
  );
}

const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(24px)",
} as const;

export default function Landing() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

  return (
    <div style={{ background: "#050505" }}>

      {/* ══ FIXED VIDEO ══ */}
      <video
        ref={videoRef}
        autoPlay muted loop playsInline
        className="fixed inset-0 w-full h-full object-cover"
        style={{ zIndex: 0, opacity: 0.55 }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      {/* Minimal dark overlay — let video breathe */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: 1,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.42) 100%),
            linear-gradient(to right,  rgba(0,0,0,0.28) 0%, transparent 60%)
          `,
        }}
      />

      {/* ══ ALL CONTENT ══ */}
      <div className="relative" style={{ zIndex: 2 }}>

        {/* ── NAVBAR — fully transparent ── */}
        <nav
          className="fixed top-0 left-0 right-0"
          style={{ zIndex: 50, background: "transparent", border: "none" }}
        >
          <div className="max-w-[1220px] mx-auto px-6 flex items-center justify-between py-5">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-[14px] grid place-items-center font-black text-lg"
                style={{
                  background: "#ffffff",
                  color: "#050505",
                  boxShadow: `0 8px 24px rgba(255,255,255,0.2)`,
                }}
              >
                T
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                TrackMind AI
              </span>
            </Link>

            {/* Nav links */}
            <div
              className="hidden md:flex items-center gap-8 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              <a href="#about"    className="hover:text-white transition-colors duration-200">About</a>
              <a href="#solution" className="hover:text-white transition-colors duration-200">Solution</a>
              <a href="#features" className="hover:text-white transition-colors duration-200">Features</a>
              <Link to="/dashboard" className="hover:text-white transition-colors duration-200">Dashboard</Link>
            </div>

            {/* CTA */}
            <Link
              to="/dashboard"
              className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: `1px solid rgba(255,255,255,0.25)`,
                color: "#ffffff",
                backdropFilter: "blur(8px)",
              }}
            >
              Live Dashboard →
            </Link>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="h-screen min-h-[700px] flex flex-col justify-end px-6 pb-16 pt-24">
          <div className="max-w-[1220px] mx-auto w-full">

            {/* Badge */}
            <div
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-semibold mb-6"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: `1px solid rgba(255,255,255,0.18)`,
                color: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(12px)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-white"
                style={{ boxShadow: `0 0 0 4px rgba(255,255,255,0.15)` }}
              />
              Railway Intelligence Platform · India
            </div>

            {/* Heading */}
            <h1
              className="font-display font-bold text-white mb-6"
              style={{
                fontSize: "clamp(3.5rem,7vw,7.5rem)",
                lineHeight: 0.92,
                letterSpacing: "-0.02em",
                textShadow: "0 4px 60px rgba(0,0,0,0.8)",
              }}
            >
              Smarter rail<br />
              movement,{" "}
              <span
                style={{
                  color: "rgba(255,255,255,0.92)",
                  WebkitTextStroke: "1px rgba(255,255,255,0.4)",
                }}
              >
                guided by<br />calm precision.
              </span>
            </h1>

            <div className="flex flex-col lg:flex-row lg:items-end gap-10 lg:gap-20">
              <div className="max-w-[520px]">
                <p className="text-lg leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.62)" }}>
                  TrackMind AI helps railway section controllers detect conflicts early,
                  evaluate operational options, and act before delay cascades across the
                  network — all in under 30 seconds.
                </p>
                <div className="flex flex-wrap gap-3">
                  {/* Primary CTA — solid white */}
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-extrabold text-base transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                    style={{
                      background: "#ffffff",
                      color: "#050505",
                      boxShadow: `0 16px 40px rgba(255,255,255,0.2)`,
                    }}
                  >
                    Explore Platform →
                  </Link>
                  {/* Secondary CTA — ghost */}
                  <a
                    href="#about"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-extrabold text-base text-white transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    View Architecture
                  </a>
                </div>
              </div>

              <div className="flex gap-12">
                <Stat val="30s"  label="Recommendation turnaround" />
                <Stat val="25%"  label="Reduction in section delays" />
                <Stat val="24×7" label="Real-time control rooms" />
              </div>
            </div>
          </div>
        </section>

        {/* ── ABOUT ── */}
        <section id="about" className="py-28 px-6">
          <div className="max-w-[1220px] mx-auto">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
              <div className="lg:w-1/2">
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-4"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  About the platform
                </p>
                <h2
                  className="font-display font-bold text-white mb-6"
                  style={{ fontSize: "clamp(2.2rem,3.5vw,3.8rem)", lineHeight: 1.05 }}
                >
                  Infrastructure that feels like the rail network
                </h2>
                <p className="text-lg leading-relaxed" style={{ color: C.muted }}>
                  The visual language is stripped back to pure form — white on black,
                  structure over decoration. Every element earns its place, just like
                  every rivet on a railway bridge.
                </p>
              </div>
              <div className="lg:w-1/2 grid grid-cols-1 gap-4">
                <FeatureCard
                  icon="⬛"
                  title="Quiet confidence"
                  desc="Monochrome surfaces let the video and content breathe — no color competing for attention, just clean information architecture."
                />
                <FeatureCard
                  icon="▬"
                  title="Rail-inspired layout"
                  desc="Long horizontal alignment, structural section dividers, and precise spacing mirror the geometry of tracks and bridge corridors."
                />
                <FeatureCard
                  icon="◈"
                  title="SIH-grade presentation"
                  desc="Cinematic hero, glassmorphism cards, and bold typography make the project stand apart from every other hackathon submission."
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── SOLUTION ── */}
        <section id="solution" className="py-28 px-6">
          <div className="max-w-[1220px] mx-auto">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              System architecture
            </p>
            <h2
              className="font-display font-bold text-white mb-16"
              style={{ fontSize: "clamp(2.2rem,3.5vw,3.8rem)", lineHeight: 1.05 }}
            >
              How the platform works
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">

              {/* Steps */}
              <div className="rounded-3xl p-10" style={GLASS}>
                <p className="text-sm mb-2" style={{ color: C.faint }}>
                  4-step intelligence pipeline
                </p>
                <Step n={1} title="Live train ingestion"
                  desc="Collect position, section, delay, priority, speed, and next-block ETA from the operational data layer in real time via Firestore." />
                <Step n={2} title="Conflict graph scan"
                  desc="Identify block-level same-section timing overlaps before they turn into emergency signal stops or cascading delays." />
                <Step n={3} title="Hybrid AI decision engine"
                  desc="MILP scheduler finds the optimal conflict-free timetable. RL agent provides instant recovery suggestions under live disruption." />
                <Step n={4} title="Explainable recommendations"
                  desc="Controller sees ranked actions with plain-language reasoning and estimated delay savings. Every decision is logged." />
              </div>

              {/* Live preview card */}
              <div className="rounded-3xl p-7 flex flex-col gap-5" style={GLASS}>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Active trains", val: "42"   },
                    { label: "Conflicts",     val: "03"   },
                    { label: "Avg delay",     val: "8.4m" },
                    { label: "On-time",       val: "87%"  },
                  ].map((k) => (
                    <div
                      key={k.label}
                      className="rounded-2xl p-4"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid rgba(255,255,255,0.09)`,
                      }}
                    >
                      <p className="text-xs mb-1" style={{ color: C.faint }}>{k.label}</p>
                      <p className="text-2xl font-extrabold text-white">{k.val}</p>
                    </div>
                  ))}
                </div>

                {/* Track schematic */}
                <div
                  className="rounded-2xl p-5 flex-1"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid rgba(255,255,255,0.08)`,
                  }}
                >
                  <p className="font-bold text-white mb-1">Live section schematic</p>
                  <p className="text-xs mb-8" style={{ color: C.faint }}>
                    NDLS – GZB corridor
                  </p>
                  <div
                    className="relative h-[3px] rounded-full"
                    style={{ background: "rgba(255,255,255,0.15)" }}
                  >
                    {[18, 48, 74].map((pos, i) => (
                      <div
                        key={i}
                        className="absolute -top-[13px] w-7 h-7 rounded-full"
                        style={{
                          left: `${pos}%`,
                          background: i === 2
                            ? "rgba(255,255,255,0.3)"
                            : "#ffffff",
                          boxShadow: i === 2
                            ? `0 0 12px rgba(255,255,255,0.2)`
                            : `0 0 20px rgba(255,255,255,0.6)`,
                          border: "2px solid rgba(255,255,255,0.5)",
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="flex justify-between text-xs mt-8"
                    style={{ color: C.faint }}
                  >
                    <span>NDLS</span><span>GZB</span>
                  </div>
                </div>

                {/* Alerts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    <p className="font-bold text-sm text-red-300 mb-1">
                      🔴 High · Block B4
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                      Train 12951 &amp; 48201 predicted same block in 4 min.
                    </p>
                  </div>
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid rgba(255,255,255,0.15)`,
                    }}
                  >
                    <p className="font-bold text-sm text-white mb-1">
                      ⚡ Recommended
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                      Hold freight at Loop-2 for 8 min — saves 23 min cumulative delay.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="py-28 px-6">
          <div className="max-w-[1220px] mx-auto">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Platform capabilities
            </p>
            <h2
              className="font-display font-bold text-white mb-4"
              style={{ fontSize: "clamp(2.2rem,3.5vw,3.8rem)", lineHeight: 1.05 }}
            >
              Every tool the controller needs
            </h2>
            <p
              className="text-lg leading-relaxed mb-16 max-w-[60ch]"
              style={{ color: C.muted }}
            >
              Every module keeps the controller in charge while the AI does the heavy
              analytical work in the background.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: "📡", title: "Real-time monitoring",  desc: "Live train positions, delay trends, and section status — updated every 10 seconds from Firestore." },
                { icon: "⚠️", title: "Conflict forecasting",  desc: "Block-level overlap prediction before controllers are forced into reactive emergency holds." },
                { icon: "🧠", title: "AI recommendations",    desc: "Ranked top-3 actions with plain-language explanation, estimated delay savings, and trains affected." },
                { icon: "📋", title: "Audit & decision logs", desc: "Every accepted, modified, or rejected action is stored for traceability, trust, and analytics." },
                { icon: "🔁", title: "What-if simulator",     desc: "Drag a train to a different loop and see the ripple effect across the section in real time." },
                { icon: "📊", title: "KPI dashboards",        desc: "Throughput, average delay, on-time percentage, and platform utilization in one view." },
                { icon: "🔐", title: "Role-based access",     desc: "Section controller, divisional manager, and admin roles — all powered by Firebase Auth." },
                { icon: "☁️", title: "Firebase backend",      desc: "Firestore real-time listeners, Cloud Functions for conflict detection, Firebase Hosting deployment." },
              ].map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-28 px-6">
          <div className="max-w-[1220px] mx-auto">
            <div
              className="relative overflow-hidden rounded-[40px] px-14 py-20 text-center"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid rgba(255,255,255,0.12)`,
                backdropFilter: "blur(30px)",
              }}
            >
              {/* Top glow line */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24"
                style={{
                  background: `linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)`,
                }}
              />
              {/* Corner glows */}
              <div
                className="absolute top-0 left-0 w-80 h-80 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
                }}
              />
              <div
                className="absolute bottom-0 right-0 w-80 h-80 rounded-full translate-x-1/2 translate-y-1/2 pointer-events-none"
                style={{
                  background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
                }}
              />

              <p
                className="text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                Get started
              </p>
              <h2
                className="font-display font-bold text-white mb-6"
                style={{
                  fontSize: "clamp(2.5rem,5vw,5.5rem)",
                  lineHeight: 1.0,
                }}
              >
                Ready to build the future<br />of railway operations?
              </h2>
              <p
                className="text-lg leading-relaxed max-w-[52ch] mx-auto mb-10"
                style={{ color: C.muted }}
              >
                TrackMind AI is designed for SIH, hackathons, and early product demos as a
                serious, national-scale railway intelligence platform.
              </p>
              <div className="flex justify-center gap-4 flex-wrap">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-full font-extrabold text-base transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                  style={{
                    background: "#ffffff",
                    color: "#050505",
                    boxShadow: `0 20px 50px rgba(255,255,255,0.2)`,
                    padding: "1.125rem 2.25rem",
                  }}
                >
                  Launch Dashboard →
                </Link>
                <a
                  href="#solution"
                  className="inline-flex items-center gap-2 rounded-full font-extrabold text-base text-white transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    backdropFilter: "blur(12px)",
                    padding: "1.125rem 2.25rem",
                  }}
                >
                  View System Flow
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer
          className="px-6 py-10"
          style={{ borderTop: `1px solid rgba(255,255,255,0.08)` }}
        >
          <div className="max-w-[1220px] mx-auto flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl grid place-items-center font-black text-sm"
                style={{ background: "#ffffff", color: "#050505" }}
              >
                T
              </div>
              <span className="font-bold text-white text-sm">TrackMind AI</span>
            </div>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.22)" }}>
              Railway Intelligence Platform · Built for Smart India Hackathon
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
}