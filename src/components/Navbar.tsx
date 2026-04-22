// src/components/Navbar.tsx
// Navbar is now embedded directly inside Landing.tsx hero section
// Keep this file for Dashboard page use only

import { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "rgba(5,13,21,0.75)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-[1220px] mx-auto px-6 flex items-center justify-between py-4">
        <Link to="/" className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[14px] grid place-items-center font-black text-lg"
            style={{ background: "linear-gradient(135deg,#89d7ff,#3b8cc2)", color: "#06111b" }}
          >
            T
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">TrackMind AI</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "rgba(180,210,230,0.7)" }}>
          <Link to="/" className="hover:text-white transition-colors">Home</Link>
          <Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
        </div>

        <Link
          to="/dashboard"
          className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#67c6ee,#2f8db8)", color: "#06111b" }}
        >
          Live Dashboard →
        </Link>

        <button className="md:hidden p-2 text-xl text-white" onClick={() => setOpen(!open)}>
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div
          className="md:hidden mx-4 mb-4 p-6 flex flex-col gap-5 rounded-2xl"
          style={{ background: "rgba(13,27,42,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Link to="/" onClick={() => setOpen(false)} style={{ color: "rgba(180,210,230,0.7)" }}>Home</Link>
          <Link to="/dashboard" onClick={() => setOpen(false)} style={{ color: "rgba(180,210,230,0.7)" }}>Dashboard</Link>
          <Link to="/dashboard" onClick={() => setOpen(false)}
            className="text-center py-3 rounded-full font-bold"
            style={{ background: "linear-gradient(135deg,#67c6ee,#2f8db8)", color: "#06111b" }}
          >
            Live Dashboard →
          </Link>
        </div>
      )}
    </nav>
  );
}