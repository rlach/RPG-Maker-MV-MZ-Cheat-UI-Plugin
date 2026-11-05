import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [...configDefaults.exclude, 'deploy/**'],
        // Each isolated worker loads the translator registry and its module graph.
        // Bound parallel imports to avoid CPU/I/O contention on high-core machines.
        maxWorkers: 4,
    },
});
