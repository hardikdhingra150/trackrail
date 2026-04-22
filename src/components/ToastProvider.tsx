import { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "warning" | "error" | "info";

interface Toast {
  id:      string;
  message: string;
  type:    ToastType;
  detail?: string;
}

interface ToastCtx {
  showToast: (message: string, type?: ToastType, detail?: string) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, string> = {
  success: "✅",
  warning: "⚠️",
  error:   "❌",
  info:    "ℹ️",
};

const COLORS: Record<ToastType, { bg: string; border: string; accent: string }> = {
  success: { bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.2)",  accent: "#4ade80" },
  warning: { bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)",  accent: "#fb923c" },
  error:   { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   accent: "#ef4444" },
  info:    { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)",  accent: "#60a5fa" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showToast = useCallback((message: string, type: ToastType = "info", detail?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, detail }]);

    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          bottom: 24, right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              style={{
                background:  c.bg,
                border:      `1px solid ${c.border}`,
                borderLeft:  `3px solid ${c.accent}`,
                borderRadius: 14,
                padding:     "12px 16px",
                minWidth:    280,
                maxWidth:    360,
                backdropFilter: "blur(20px)",
                boxShadow:   "0 8px 32px rgba(0,0,0,0.4)",
                display:     "flex",
                alignItems:  "flex-start",
                gap:         10,
                pointerEvents: "all",
                animation:   "toastIn 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ICONS[t.type]}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.4 }}>
                  {t.message}
                </p>
                {t.detail && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {t.detail}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: "none", border: "none",
                  color: "rgba(255,255,255,0.3)",
                  cursor: "pointer", fontSize: 14,
                  padding: "0 2px", flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}