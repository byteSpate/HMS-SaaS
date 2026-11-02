import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// API tests use DATABASE_URL from the root .env locally; CI sets it directly.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

// SWC emits decorator metadata, which NestJS dependency injection needs (ADR-018).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    // These specs share one PostgreSQL and hash passwords with Argon2. Running files side by side
    // pushed logins past the 5 second test limit, so they run one file at a time.
    fileParallelism: false,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
  },
});
