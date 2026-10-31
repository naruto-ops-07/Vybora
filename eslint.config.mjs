// ESLint for the repository's own Node scripts under scripts/.
//
// Each app and package lints its own `src` with the shared TypeScript config
// in @vybora/config/eslint. Nothing reached scripts/, so the generators and
// build helpers there had no lint coverage at all. They are plain Node ESM
// and print progress, so this config is the JS recommended set with Node
// globals rather than the TypeScript/React base.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
