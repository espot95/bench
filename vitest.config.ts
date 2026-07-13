import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Simulation-heavy suites (full seasons, 80-club worlds) legitimately exceed the 5s
    // default under parallel load; these are Monte Carlo gates, not unit micro-tests.
    testTimeout: 30000,
  },
});
