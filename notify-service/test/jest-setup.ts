import 'dotenv/config';

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3201';
process.env.NOTIFY_DATABASE_URL ??=
  'postgresql://blujet:blujet@localhost:5432/blujet_notify_test';
process.env.NOTIFY_INTERNAL_TOKEN ??=
  'test-notify-internal-token-at-least-32-characters';
process.env.PII_ENCRYPTION_KEY ??=
  '3a6dfd91b775e9cd09be8a576889adfe518a31ad1064af3d63c21ce9aadbdf10';
