import { useState, useEffect, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import logoImg from "../assets/Logo.png";

export default function LoginScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [logoError, setLogoError] = useState(false);

  const { hasPassword, error, login, createPassword, checkHasPassword } = useAuthStore();

  useEffect(() => {
    checkHasPassword();
  }, [checkHasPassword]);

  const isCreateMode = hasPassword === false;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (isCreateMode) {
      if (password.length < 4) {
        setLocalError("Senha deve ter no minimo 4 caracteres");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Senhas nao conferem");
        return;
      }
      await createPassword(password);
    } else {
      await login(password);
    }
  };

  const displayError = localError || error;

  // Loading state
  if (hasPassword === null) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "#0a0a0f" }}
      >
        <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

      <motion.form
        onSubmit={handleSubmit}
        className="relative flex flex-col items-center gap-6 p-10 rounded-2xl max-w-sm w-full mx-4"
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
            {isCreateMode
              ? "Crie sua senha mestra para proteger o workspace"
              : "Desbloqueie seu workspace"}
          </p>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-3 w-full">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isCreateMode ? "Nova senha mestra" : "Senha mestra"}
            required
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
            style={{
              background: "var(--mx-input-bg)",
              border: "1px solid var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#22D3EE")}
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--mx-input-border)")
            }
          />
          {isCreateMode && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme a senha"
              required
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: "var(--mx-input-bg)",
                border: "1px solid var(--mx-input-border)",
                color: "var(--mx-text)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#22D3EE")}
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--mx-input-border)")
              }
            />
          )}
        </div>

        {/* Error message */}
        {displayError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
          >
            {displayError}
          </motion.p>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{
            background: "linear-gradient(135deg, #A855F7, #22D3EE)",
          }}
        >
          {isCreateMode ? "Criar Senha" : "Entrar"}
        </button>

        {/* Lock icon footer */}
        <div className="flex items-center gap-1.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--mx-text-muted)" }}
          >
            <rect
              x="3"
              y="11"
              width="18"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M7 11V7a5 5 0 0110 0v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="text-[10px]"
            style={{ color: "var(--mx-text-muted)" }}
          >
            {isCreateMode
              ? "Chaves API protegidas com safeStorage"
              : "Protegido por criptografia local"}
          </span>
        </div>
      </motion.form>
    </div>
  );
}
