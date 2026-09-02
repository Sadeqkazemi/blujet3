import { ConfigService } from '@nestjs/config';
import { createSign, generateKeyPairSync, KeyObject } from 'node:crypto';
import { IdentityJwtVerifierService } from './identity-jwt-verifier.service';

function rsaKeyPair() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

function token(privateKey: KeyObject, kid = 'test-key'): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode({
    sub: 'user-1',
    role: 'USER',
    fullName: 'Test User',
    iss: 'https://identity.test',
    aud: 'blujet-gateway',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

describe('IdentityJwtVerifierService', () => {
  it('verifies an RS256 token against the cached public key', async () => {
    const { privateKey, publicKey } = rsaKeyPair();
    const cache = {
      enabled: () => true,
      get: () => publicKey,
      getWithRefresh: () => Promise.resolve(publicKey),
    };
    const verifier = new IdentityJwtVerifierService(
      new ConfigService({
        IDENTITY_INTEGRATION_ENABLED: 'true',
        IDENTITY_JWT_ISSUER: 'https://identity.test',
        IDENTITY_JWT_AUDIENCE: 'blujet-gateway',
      }),
      cache as never,
    );
    await expect(verifier.verify(token(privateKey))).resolves.toMatchObject({
      id: 'user-1',
      role: 'USER',
    });
  });

  it('accepts HS256 only through the legacy side of dual rollback mode', () => {
    const cache = {
      enabled: () => true,
      get: () => rsaKeyPair().publicKey,
    };
    const verifier = new IdentityJwtVerifierService(
      new ConfigService({ IDENTITY_JWT_VERIFICATION_MODE: 'dual' }),
      cache as never,
    );
    expect(
      verifier.requiresIdentityToken('eyJhbGciOiJIUzI1NiJ9.payload.signature'),
    ).toBe(false);
    expect(verifier.requiresIdentityToken(token(rsaKeyPair().privateKey))).toBe(
      true,
    );
  });
});
