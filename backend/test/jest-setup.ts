import * as dotenv from 'dotenv';
import * as path from 'node:path';
import '../src/common/bigint-json';

// Prefer .env.test over ambient shell env (e.g. a leftover PII_ENCRYPTION_KEY
// from a previous local stack) so e2e matches CI.
dotenv.config({
  path: path.join(__dirname, '..', '.env.test'),
  override: true,
  quiet: true,
});
