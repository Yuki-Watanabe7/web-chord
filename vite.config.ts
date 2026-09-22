import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // OMR runner tests use Node's built-in test runner and are invoked by
    // `npm run test:omr` after this project-owned Vitest suite.
    include: ['src/**/*.test.{ts,tsx}', 'benchmarks/import/**/*.test.mjs'],
  },
})
