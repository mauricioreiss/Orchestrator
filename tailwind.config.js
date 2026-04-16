/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-purple": "#A855F7",
        "brand-cyan": "#22D3EE",
        mx: {
          bg: "var(--mx-bg)",
          surface: "var(--mx-surface)",
          "surface-alt": "var(--mx-surface-alt)",
          border: "var(--mx-border)",
          "border-strong": "var(--mx-border-strong)",
          text: "var(--mx-text)",
          "text-secondary": "var(--mx-text-secondary)",
          muted: "var(--mx-text-muted)",
          accent: "var(--mx-accent)",
          "accent-glow": "var(--mx-accent-glow)",
          terminal: "var(--mx-terminal)",
          note: "var(--mx-note)",
          vscode: "var(--mx-vscode)",
          obsidian: "var(--mx-obsidian)",
          browser: "var(--mx-browser)",
          success: "var(--mx-success)",
          warning: "var(--mx-warning)",
          error: "var(--mx-error)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono Variable", "Consolas", "monospace"],
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
