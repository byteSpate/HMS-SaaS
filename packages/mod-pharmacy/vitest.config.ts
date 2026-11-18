import { defineConfig } from 'vitest/config';

// Domain rules only: the HTTP and database behavior is tested in apps/api
// (medicines.api.spec.ts).
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
});
