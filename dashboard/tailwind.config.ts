import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './styles/**/*.css',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
