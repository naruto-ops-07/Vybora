import { defineConfig } from 'vitest/config';

// The whole database suite runs twice:
//  - defaults: the shim installs Supabase's old default privileges (every new
//    object in public is granted to anon/authenticated/service_role);
//  - strict: no default privileges, as on newer hosted projects, so anything a
//    migration forgot to grant explicitly fails here (see harness/boot.mjs).
// explicit-grants.test.ts boots both modes itself, so it runs once.
const GRANTS_ONLY = 'explicit-grants.test.ts';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Each file boots its own WASM Postgres; keep parallelism modest.
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: 'defaults',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', GRANTS_ONLY],
          env: { VYBORA_DB_GRANTS: 'defaults' },
        },
      },
      {
        extends: true,
        test: {
          name: 'strict',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**'],
          env: { VYBORA_DB_GRANTS: 'strict' },
        },
      },
    ],
  },
});
