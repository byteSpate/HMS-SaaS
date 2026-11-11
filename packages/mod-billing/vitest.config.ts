import { defineConfig } from 'vitest/config';

// Domain rules only: the HTTP and database behavior is tested in apps/api
// (price-lists.api.spec.ts).
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
});
