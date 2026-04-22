import { useAuthState } from "react-firebase-hooks/auth";
import { Navigate, useLocation } from "react-router-dom";
import { auth } from "../lib/firebase";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, loading] = useAuthState(auth);
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#050505" }}
      >
        {/* Video background while loading */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="fixed inset-0 w-full h-full object-cover"
          style={{ zIndex: 0, opacity: 0.45 }}
        >
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay */}
        <div
          className="fixed inset-0"
          style={{ zIndex: 1, background: "rgba(0,0,0,0.55)" }}
        />

        {/* Loader content */}
        <div className="relative flex flex-col items-center gap-5" style={{ zIndex: 2 }}>

          {/* Logo */}
          <div
            className="w-14 h-14 rounded-[18px] grid place-items-center font-black text-2xl"
            style={{
              background: "#ffffff",
              color: "#050505",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 16px 40px rgba(255,255,255,0.15)",
              animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
            }}
          >
            T
          </div>

          {/* Spinner bar */}
          <div
            className="w-32 h-0.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: "rgba(255,255,255,0.6)",
                width: "40%",
                animation: "slide 1.4s ease-in-out infinite",
              }}
            />
          </div>

          <p
            className="text-xs font-medium tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Authenticating
          </p>
        </div>

        {/* Keyframes injected inline */}
        <style>{`
          @keyframes slide {
            0%   { transform: translateX(-100%); }
            50%  { transform: translateX(200%); }
            100% { transform: translateX(200%); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
