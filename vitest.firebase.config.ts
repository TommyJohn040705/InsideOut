import { defineConfig } from 'vitest/config';

// Emulator-backed tests. Run with: npm run test:firebase
export default defineConfig({
  test: {
    include: ['firebase-tests/**/*.emulator.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
