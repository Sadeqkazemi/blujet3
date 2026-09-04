import 'reflect-metadata';
process.env.NODE_ENV = 'test';
process.env.LOYALTY_DATABASE_URL ??=
  'postgresql://blujet:blujet@localhost:5432/blujet_test';
process.env.LOYALTY_INTERNAL_TOKEN =
  'test-loyalty-internal-token-at-least-32-characters';
const url = new URL(process.env.LOYALTY_DATABASE_URL);
if (!url.pathname.endsWith('_test'))
  throw new Error('E2E requires an explicitly named _test database');
