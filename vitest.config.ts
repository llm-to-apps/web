import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@/server': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@/ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    exclude: ['dist-worker/**', 'node_modules/**', 'tests/e2e/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true
  }
})
