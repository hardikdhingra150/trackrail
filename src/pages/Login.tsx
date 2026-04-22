import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

function friendlyError(code: string): string {
  switch (code) {
    case "auth/user-not-found":         return "No account found with this email.";
    case "auth/wrong-password":         return "Incorrect password. Please try again.";
    case "auth/invalid-credential":     return "Incorrect email or password.";
    case "auth/email-already-in-use":   return "This email is already registered. Sign in instead.";
    case "auth/weak-password":          return "Password must be at least 6 characters.";
    case "auth/invalid-email":          return "Please enter a valid email address.";
    case "auth/too-many-requests":      return "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":   return "Google sign-in was cancelled.";
    case "auth/network-request-failed": return "Network error. Check your connection.";
    default:                            return "Something went wrong. Please try again.";
  }
}

export default function Login() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  const [mode, setMode]         = useState<"login" | "signup">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true); // checking existing session

  const clearError = () => setError("");

  // ── Slow down video ──
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

  // ── If already logged in → skip login page ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate(redirectTo, { replace: true });
      } else {
        setChecking(false); // not logged in → show login form
      }
    });
    return () => unsub();
  }, [navigate, redirectTo]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ── While checking session — show minimal loader (not blank screen) ──
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050505" }}>
        <video
          autoPlay muted loop playsInline
          className="fixed inset-0 w-full h-full object-cover"
          style={{ zIndex: 0, opacity: 0.45 }}
        >
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
        <div className="fixed inset-0" style={{ zIndex: 1, background: "rgba(0,0,0,0.55)" }} />
        <div className="relative flex flex-col items-center gap-4" style={{ zIndex: 2 }}>
          <div
            className="w-12 h-12 rounded-[16px] grid place-items-center font-black text-xl animate-pulse"
            style={{ background: "#ffffff", color: "#050505" }}
          >
            T
          </div>
          <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
            Checking session…
          </p>
        </div>
      </div>
    );
  }

  // ── Main login UI ──
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#050505" }}>

      {/* ══ FIXED VIDEO ══ */}
      <video
        ref={videoRef}
        autoPlay muted loop playsInline
        className="fixed inset-0 w-full h-full object-cover"
        style={{ zIndex: 0, opacity: 0.45 }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: 1,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%),
            linear-gradient(to right,  rgba(0,0,0,0.28) 0%, transparent 60%)
          `,
        }}
      />

      {/* ══ CONTENT ══ */}
      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 2 }}>

        {/* ── Navbar ── */}
        <div className="px-6 py-5 flex items-center justify-between max-w-[1220px] mx-auto w-full">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[14px] grid place-items-center font-black text-lg"
              style={{
                background: "#ffffff",
                color: "#050505",
                boxShadow: "0 8px 24px rgba(255,255,255,0.2)",
              }}
            >
              T
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">
              TrackMind AI
            </span>
          </Link>

          <Link
            to="/"
            className="text-sm font-medium transition-colors duration-200 hover:text-white"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            ← Back to home
          </Link>
        </div>

        {/* ── Card area ── */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">

            {/* Badge above card */}
            <div className="flex items-center justify-center mb-6">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white"
                  style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.15)" }}
                />
                Secure controller access
              </div>
            </div>

            {/* Card */}
            <div
              className="rounded-[28px] p-8"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(32px)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
              }}
            >
              {/* Title */}
              <h1
                className="font-bold text-white mb-1"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)", lineHeight: 1.1 }}
              >
                {mode === "login" ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.42)" }}>
                {mode === "login"
                  ? "Sign in to access the controller dashboard."
                  : "Sign up to get started with TrackMind AI."}
              </p>
              {redirectTo !== "/dashboard" && (
                <div
                  className="mb-5 rounded-2xl px-4 py-3 text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  After sign-in, you will continue to <span className="font-bold text-white">{redirectTo}</span>.
                </div>
              )}

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-sm mb-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#ffffff",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                  or continue with email
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>

              {/* Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError(); }}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.45)")}
                    onBlur={(e)  => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.45)")}
                    onBlur={(e)  => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>

                {error && (
                  <div
                    className="px-4 py-3 rounded-xl text-sm"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      color: "#fca5a5",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-extrabold text-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "#ffffff",
                    color: "#050505",
                    boxShadow: "0 8px 32px rgba(255,255,255,0.18)",
                  }}
                >
                  {loading
                    ? "Please wait…"
                    : mode === "login"
                    ? "Sign in →"
                    : "Create account →"}
                </button>
              </form>

              {/* Toggle */}
              <p className="text-center text-sm mt-6" style={{ color: "rgba(255,255,255,0.32)" }}>
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { setMode(mode === "login" ? "signup" : "login"); clearError(); }}
                  className="font-bold text-white hover:underline"
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>

            </div>

            {/* Below card note */}
            <p className="text-center text-xs mt-5" style={{ color: "rgba(255,255,255,0.2)" }}>
              Railway Intelligence Platform · Smart India Hackathon
            </p>

          </div>
        </div>

      </div>
    </div>
  );
}
