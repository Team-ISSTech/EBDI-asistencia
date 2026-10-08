import { react } from '@sirai/eslint-config/react';

export default [...react, { ignores: ['playwright-report', 'test-results'] }];
