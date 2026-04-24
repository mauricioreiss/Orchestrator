import { useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import logoImg from "../assets/Logo.png";

export default function LoginScreen() {
  const [logoError, setLogoError] = useState(false);
  const enter = useAuthStore((s) => s.enter);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(-45deg, #0a0a0f, #1a0a2e, #0a1628, #0a0a0f)",
        backgroundSize: "400% 400%",
        animation: "gradient-shift 15s ease infinite",
      }}
    >
      {/* Radial glow accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 50% 45%, rgba(168, 85, 247, 0.08) 0%, transparent 70%)",
        }}
      />

      {/* Secondary glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 60% 55%, rgba(34, 211, 238, 0.04) 0%, transparent 70%)",
        }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-8 p-10 rounded-2xl max-w-sm w-full mx-4"
        style={{
          background: "var(--mx-glass-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--mx-glass-border)",
          boxShadow:
            "0 0 80px rgba(168, 85, 247, 0.1), 0 24px 80px rgba(0,0,0,0.4)",
        }}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: -40 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        {!logoError ? (
          <img
            src={logoImg}
            alt="Orchestrated Space"
            className="w-32 mx-auto"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold"
            style={{
              background: "linear-gradient(135deg, #A855F7, #22D3EE)",
              color: "#fff",
            }}
          >
            OS
          </div>
        )}

        {/* Title */}
        <div className="text-center">
          <h1
            className="text-2xl font-semibold"
            style={{
              color: "var(--mx-text)",
              letterSpacing: "-0.02em",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            Orchestrated Space
          </h1>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--mx-text-secondary)" }}
          >
            War Room OS para Dev Teams
          </p>
        </div>

        {/* Enter button */}
        <button
          type="button"
          onClick={enter}
          className="group relative w-full py-3.5 rounded-lg text-sm font-semibold text-white transition-all active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, #A855F7, #22D3EE)",
          }}
        >
          <span className="relative z-10">Iniciar Orquestrador</span>
          {/* Glow on hover */}
          <div
            className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              boxShadow: "0 0 24px rgba(168, 85, 247, 0.5), 0 0 48px rgba(34, 211, 238, 0.2)",
            }}
          />
        </button>

        {/* Version footer */}
        <span
          className="text-[10px]"
          style={{ color: "var(--mx-text-muted)" }}
        >
          Alpha v0.2.0
        </span>
      </motion.div>
    </div>
  );
}
