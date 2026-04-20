/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#07111c",
          soft: "#0d1b2a",
          2: "#102235",
          card: "#13283a",
        },
      },
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        display: ["'Playfair Display'", "serif"],
      },
    },
  },
  plugins: [],
};