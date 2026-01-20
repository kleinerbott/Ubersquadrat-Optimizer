import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  test: {
    // Environment for DOM-related tests (components)
    environment: 'happy-dom',

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // Benchmark file patterns
    benchmark: {
      include: ['tests/benchmarks/**/*.bench.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },

    // Global test setup
    globals: true,

    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '*.config.js'
      ]
    },

    // Alias resolution (match vite.config.js if you have aliases)
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
