import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 500: "#16a34a", 600: "#15803d", 700: "#166534" },
      },
    },
  },
  plugins: [],
} satisfies Config;
