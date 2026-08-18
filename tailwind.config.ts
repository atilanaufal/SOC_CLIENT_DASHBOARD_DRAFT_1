import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          50: "#e8edf8",
          100: "#c4d3f2",
          500: "#1d4ed8",
          600: "#1e40af",
          700: "#002B9A",
          800: "#001C66",
          900: "#0A1128",
        },
        severity: {
          critical: "#FF1E1E",
          high: "#FF6B00",
          medium: "#FFC700",
          low: "#3B82F6",
        }
      },
      borderRadius: {
        'none': '0px',
        'sm': '0.25rem',  /* 4px */
        DEFAULT: '0.375rem', /* 6px */
        'md': '0.375rem', /* 6px */
        'lg': '0.5rem',   /* 8px */
        'xl': '0.625rem',  /* 10px */
      },
    },
  },
  plugins: [],
};
export default config;
