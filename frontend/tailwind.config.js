/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0F14",
        darkSidebar: "#11161D",
        darkCard: "#1A1F27",
        darkBorder: "#2A2F3A",
        accent: "#F4C430",
        accentHover: "#FFD95A",
        textPrimary: "#EAECEF",
        textSecondary: "#9AA4B2"
      },
      boxShadow: {
        card: "0 10px 24px rgba(0, 0, 0, 0.35)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: []
};
