import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#c9921a",
          600: "#a87316",
          700: "#855712",
          800: "#623f0e",
          900: "#3f280a",
        },
        obsidian: {
          50:  "#f5f5f7",
          100: "#e8e8ed",
          200: "#d1d1db",
          300: "#a8a8bc",
          400: "#6f6f85",
          500: "#3f3f51",
          600: "#27273a",
          700: "#1c1c2e",
          800: "#13131f",
          900: "#0b0b14",
          950: "#07070e",
        },
      },
      fontFamily: {
        sans:    ["var(--font-inter)",    "system-ui", "sans-serif"],
        display: ["var(--font-display)",  "Georgia",   "serif"],
        mono:    ["var(--font-mono)",     "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "gold-gradient":   "linear-gradient(135deg, #c9921a 0%, #fde68a 50%, #c9921a 100%)",
        "gold-subtle":     "linear-gradient(135deg, #c9921a 0%, #fbbf24 100%)",
        "dark-gradient":   "linear-gradient(160deg, #0b0b14 0%, #13131f 60%, #0b0b14 100%)",
        "card-gradient":   "linear-gradient(145deg, rgba(201,146,26,0.06) 0%, transparent 70%)",
        "sidebar-active":  "linear-gradient(90deg, rgba(201,146,26,0.12) 0%, rgba(201,146,26,0.04) 100%)",
        "noise":           "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      boxShadow: {
        gold:     "0 0 20px rgba(201,146,26,0.18), 0 4px 12px rgba(0,0,0,0.5)",
        "gold-lg":"0 0 40px rgba(201,146,26,0.25), 0 12px 40px rgba(0,0,0,0.6)",
        "gold-sm":"0 0 8px  rgba(201,146,26,0.20)",
        glass:    "0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glass-lg":"0 8px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        inner:    "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
      },
      animation: {
        "fade-up":      "fade-up 0.4s ease-out both",
        "fade-in":      "fade-in 0.3s ease-out both",
        "slide-right":  "slide-right 0.35s ease-out both",
        "scale-in":     "scale-in 0.2s ease-out both",
        "float":        "float 6s ease-in-out infinite",
        "float-slow":   "float 9s ease-in-out infinite",
        "pulse-gold":   "pulse-gold 2.5s ease-in-out infinite",
        "shimmer":      "shimmer 2s linear infinite",
        "typing":       "typing 1.2s steps(3) infinite",
        "spin-slow":    "spin 8s linear infinite",
        "glow":         "glow 3s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-right": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%":     { transform: "translateY(-12px)" },
        },
        "pulse-gold": {
          "0%,100%": { boxShadow: "0 0 12px rgba(201,146,26,0.2)" },
          "50%":     { boxShadow: "0 0 30px rgba(201,146,26,0.5)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
        typing: {
          "0%":   { content: "''" },
          "33%":  { content: "'.'" },
          "66%":  { content: "'..'" },
          "100%": { content: "'...'" },
        },
        glow: {
          "0%,100%": { opacity: "0.5" },
          "50%":     { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
