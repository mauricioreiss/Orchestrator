/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        shark: {
          bg: "#0f0f1a",
          surface: "#1a1a2e",
          border: "#2a2a4a",
          accent: "#7c3aed",
          text: "#e2e8f0",
          muted: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
};
