import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: '/ppl-tracker/',
  // Cast: vite@8 vs vitest's bundled vite types disagree on PluginOption
  plugins: [react() as never],
  test: {
    // jsdom so core hooks can be tested with @testing-library/react
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
