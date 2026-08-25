/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Light theme
        paper: "#FAFAF9",
        card: "#FFFFFF",
        line: "#E4E4E1",
        "line-strong": "#D1D1CC",
        ink: "#16181A",
        "ink-muted": "#6B7075",
        "ink-faint": "#9A9E9F",
        field: "#FCFCFB",
        accent: "#1C4E80",
        profit: "#1E7A4C",
        risk: "#B3402A",
        "warn-bg": "#FBF0EC",
        "warn-border": "#E6C3B6",
        "warn-text": "#8A3A22",
        result: "#F4F6F5",

        // Dark theme
        "paper-dark": "#0C0D0E",
        "card-dark": "#141618",
        "line-dark": "#26292C",
        "line-strong-dark": "#33373B",
        "ink-dark": "#EDEEEE",
        "ink-muted-dark": "#9AA0A6",
        "ink-faint-dark": "#6E7378",
        "field-dark": "#1A1C1F",
        "accent-dark": "#6FA8DC",
        "profit-dark": "#5FBE87",
        "risk-dark": "#E28268",
        "warn-bg-dark": "#241813",
        "warn-border-dark": "#4A2E20",
        "warn-text-dark": "#E28268",
        "result-dark": "#18191B",
      },
      borderRadius: {
        card: "8px",
      },
    },
  },
  plugins: [],
};
