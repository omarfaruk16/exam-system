import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Integration specs share one dev DB and mutate seeded rows (e.g. teacher assignments);
    // run files sequentially so they don't race each other.
    fileParallelism: false,
  },
  // esbuild needs the legacy-decorator hint to transform @Injectable() classes under test.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
});
