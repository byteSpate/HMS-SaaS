import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits decorator metadata, which NestJS dependency injection needs (ADR-018).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    // These specs share one PostgreSQL. Files side by side made the 1,000 allocation test wait on
    // connections instead of measuring the sequence.
    fileParallelism: false,
  },
});
