import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import logoImg from "../assets/Logo.png";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logoError, setLogoError] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, #0a0a0f 0%, #18181b 50%, #0a0a0f 100%)",
      }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(168, 85, 247, 0.06) 0%, transparent 70%)",
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
            "0 0 60px rgba(168, 85, 247, 0.08), 0 16px 64px rgba(0,0,0,0.3)",
        }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
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
            Espaco de Trabalho Espacial e Engine de Workflow
          </p>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-3 w-full">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
            style={{
              background: "var(--mx-input-bg)",
              border: "1px solid var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#22D3EE")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--mx-input-border)")
            }
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            required
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
            style={{
              background: "var(--mx-input-bg)",
              border: "1px solid var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#22D3EE")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--mx-input-border)")
            }
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{
            background: "linear-gradient(135deg, #A855F7, #22D3EE)",
          }}
        >
          Entrar
        </button>
      </motion.form>
    </div>
  );
}
