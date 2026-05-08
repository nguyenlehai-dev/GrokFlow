/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          500: "#3b6ef7",
          600: "#2c55d6",
          700: "#1f3fa3",
        },
      },
    },
  },
  plugins: [],
};
