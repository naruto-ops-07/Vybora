import base from '@vybora/config/eslint';

export default [...base, { ignores: ['playwright-report', 'test-results'] }];
