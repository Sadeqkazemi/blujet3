import 'dotenv/config';

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3301';
process.env.EXPERIENCE_DATABASE_URL ??=
  'postgresql://blujet:blujet@localhost:5432/blujet_test?schema=public';
process.env.EXPERIENCE_INTERNAL_TOKEN ??=
  'test-experience-internal-token-at-least-32-characters';
process.env.PII_ENCRYPTION_KEY ??=
  '3a6dfd91b775e9cd09be8a576889adfe518a31ad1064af3d63c21ce9aadbdf10';
