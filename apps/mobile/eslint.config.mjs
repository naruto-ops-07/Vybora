// CommonJS-free flat config; Expo's own lint preset can be added with `npx expo lint`.
import base from '@vybora/config/eslint';

export default [
  ...base,
  { ignores: ['jest.config.js', '.expo', 'expo-env.d.ts'] },
  { files: ['**/__tests__/**'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];
