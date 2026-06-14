/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Category colors used across 2D + 3D views and badges.
        cat: {
          pharmacogenomic: "#a78bfa",
          "disease-risk": "#f87171",
          trait: "#60a5fa",
          fitness: "#34d399",
          "body-composition": "#fbbf24",
          vision: "#22d3ee",
        },
      },
    },
  },
  plugins: [],
};
