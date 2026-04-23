import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

type PassengerPageShellProps = {
  badge: string;
  title: ReactNode;
  description: string;
  actions?: ReactNode;
  maxWidth?: string;
  children: ReactNode;
};

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/book", label: "Book Ticket" },
  { to: "/journey-planner", label: "Journey Planner" },
  { to: "/live-status", label: "Live Status" },
  { to: "/platform-alerts", label: "Platform Alerts" },
  { to: "/pnr-status", label: "PNR Status" },
  { to: "/my-bookings", label: "My Bookings" },
  { to: "/dashboard", label: "Dashboard" },
];

export default function PassengerPageShell({
  badge,
  title,
  description,
  actions,
  maxWidth = "1220px",
  children,
}: PassengerPageShellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

  return (
    <div style={{ background: "#050505" }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 h-full w-full object-cover"
        style={{ zIndex: 0, opacity: 0.48 }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      <div
        className="fixed inset-0"
        style={{
          zIndex: 1,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.7) 100%),
            linear-gradient(to right, rgba(0,0,0,0.32) 0%, transparent 58%)
          `,
        }}
      />

      <div className="relative min-h-screen" style={{ zIndex: 2 }}>
        <nav className="fixed left-0 right-0 top-0" style={{ zIndex: 50, background: "transparent", border: "none" }}>
          <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-8 px-6 py-5">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <div
                className="grid h-10 w-10 place-items-center rounded-[14px] font-black text-lg"
                style={{
                  background: "#ffffff",
                  color: "#050505",
                  boxShadow: "0 8px 24px rgba(255,255,255,0.2)",
                }}
              >
                T
              </div>
              <span className="text-base font-extrabold tracking-tight text-white">TrackMind AI</span>
            </Link>

            <div className="hidden flex-1 items-center justify-end gap-8 xl:flex">
              <div className="flex items-center gap-6 text-sm font-medium text-white/60">
                {navLinks.map((item) => (
                  <Link key={item.to} to={item.to} className="transition-colors duration-200 hover:text-white">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <div className="min-h-screen px-5 pb-10 pt-28 md:px-6 md:pt-32">
          <div className="mx-auto" style={{ maxWidth }}>
            <div className="mb-8 max-w-[860px]">
              <p
                className="mb-4 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-white"
                  style={{ boxShadow: "0 0 0 4px rgba(255,255,255,0.15)" }}
                />
                {badge}
              </p>

              <h1
                className="font-display font-bold tracking-tight text-white"
                style={{
                  fontSize: "clamp(2.7rem,5.5vw,5rem)",
                  lineHeight: 0.92,
                  letterSpacing: "-0.03em",
                  textShadow: "0 4px 60px rgba(0,0,0,0.7)",
                }}
              >
                {title}
              </h1>

              {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}

              <p className="mt-5 max-w-[760px] text-base leading-relaxed text-white/62 md:text-lg">
                {description}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
