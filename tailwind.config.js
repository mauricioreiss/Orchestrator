/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        mx: {
          // Custom base
          bg: "#0f0f1a",
          surface: "#1a1a2e",
          border: "#2a2a4a",
          accent: "#7c3aed",
          text: "#e2e8f0",
          muted: "#94a3b8",
          // Catppuccin Mocha
          crust: "#11111b",
          mantle: "#181825",
          base: "#1e1e2e",
          surface0: "#313244",
          surface1: "#45475a",
          overlay0: "#6c7086",
          subtext: "#a6adc8",
          "text-light": "#cdd6f4",
          // Node accent colors
          terminal: "#7c3aed",
          note: "#f59e0b",
          vscode: "#06b6d4",
          obsidian: "#a855f7",
        },
      },
    },
  },
  plugins: [],
};
