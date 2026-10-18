/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // One worker per core oversubscribes the machine when `pnpm check` runs every
  // package's tests at once, which turns 5 s test limits into timeouts.
  maxWorkers: 4,
  // The first test in a suite pays for loading React Native and Expo modules; on a
  // busy machine (Metro or Vite running alongside) that alone can pass 5 s.
  testTimeout: 15000,
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Workspace packages ship TypeScript source; let babel transform them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@vybora/.*|@noble/.*|@scure/.*|@hpke/.*|ts-mls|phosphor-react-native|@expo-google-fonts/.*)',
  ],
};
