import { generateKeyPairSync } from 'node:crypto';
import 'dotenv/config';

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3401';
process.env.IDENTITY_INTERNAL_TOKEN ??= 'test-identity-internal-token-at-least-32';
process.env.IDENTITY_JWT_KID ??= 'identity-e2e-key';
process.env.IDENTITY_JWT_ISSUER ??= 'https://identity.test.internal';
process.env.IDENTITY_JWT_AUDIENCE ??= 'blujet-gateway';
if (!process.env.IDENTITY_JWT_PRIVATE_KEY) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.IDENTITY_JWT_PRIVATE_KEY = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
}
