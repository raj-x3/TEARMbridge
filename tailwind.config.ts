import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        app: "#F7F7F5",
        surface: "#FFFFFF",
        sidebar: {
          bg: "#171A20",
          hover: "#22262E",
          active: "#2A303C",
          border: "#282C36",
          muted: "#88909E",
          text: "#E5E7EB",
        },
        primary: {
          DEFAULT: "#3159D9",
          hover: "#2748B8",
          subtle: "#EFF3FF",
          border: "#CBD7FE",
        },
        content: {
          primary: "#191B20",
          secondary: "#727782",
          muted: "#969BA4",
        },
        border: {
          DEFAULT: "#E5E6E3",
          subtle: "#EEEEEC",
          strong: "#D2D4D0",
        },
        badge: {
          success: {
            bg: "#F0FDF4",
            text: "#15803D",
            border: "#DCFCE7",
          },
          warning: {
            bg: "#FFFBEB",
            text: "#B45309",
            border: "#FEF3C7",
          },
          error: {
            bg: "#FEF2F2",
            text: "#B91C1C",
            border: "#FEE2E2",
          },
          info: {
            bg: "#F0F5FF",
            text: "#2563EB",
            border: "#DBEAFE",
          },
          neutral: {
            bg: "#F4F4F2",
            text: "#525866",
            border: "#E5E6E3",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        elevated: "0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)",
        dropdown: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.06)",
        modal: "0 20px 35px -10px rgba(0, 0, 0, 0.14), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
