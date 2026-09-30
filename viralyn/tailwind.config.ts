import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0b1020", 800: "#111831", 700: "#1a2342" },
        brand: { blue: "#3b6cf6", purple: "#8b5cf6" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
