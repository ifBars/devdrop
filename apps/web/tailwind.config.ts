import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["Outfit", "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "#f5f4ef",
        ink: {
          DEFAULT: "#16150f",
          soft: "#3a3830",
          mute: "#6b685e",
          line: "#16150f14",
        },
        forest: {
          50: "#eef4f0",
          100: "#d8e6dc",
          200: "#aecdb6",
          300: "#7ba988",
          400: "#4f8460",
          500: "#2f6742",
          600: "#1f5233",
          700: "#173f28",
          800: "#102e1d",
          900: "#0b2014",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,21,15,0.04), 0 12px 32px -16px rgba(22,21,15,0.10)",
        cardLift: "0 1px 2px rgba(22,21,15,0.05), 0 22px 48px -20px rgba(22,21,15,0.18)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
        ring: "0 0 0 1px rgba(22,21,15,0.08)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.82)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        barGrow: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.22,1,0.36,1) both",
        pulseDot: "pulseDot 1.8s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        barGrow: "barGrow 1.1s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
