/** @type {import('tailwindcss').Config} */
module.exports = {
  // यह Tailwind को बताता है कि वह किन फ़ाइलों को स्कैन करके CSS क्लासेस को बंडल करे।
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // src फ़ोल्डर के अंदर सभी JS, JSX, TS, TSX फ़ाइलों को शामिल करें।
    "./public/index.html",         // यदि आप index.html में भी Tailwind का उपयोग कर रहे हैं।
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
