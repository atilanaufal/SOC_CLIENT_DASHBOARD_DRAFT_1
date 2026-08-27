import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        bmw: {
          blue: "#0066B1",
          darkBlue: "#002B9A",
          navy: "#0A1128",
          light: "#EBF3FA",
          black: "#0A0A0A",
        },
        navy: {
          50: "#eaf2fb",
          100: "#d0e2f7",
          500: "#0066b1",
          600: "#005299",
          700: "#003d7a",
          800: "#002B9A",
          900: "#0A1128",
        },
        severity: {
          critical: "#FF1E1E",
          high: "#FF6B00",
          medium: "#D97706",
          low: "#0066B1",
        }
      },
      boxShadow: {
        none: 'none',
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
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
