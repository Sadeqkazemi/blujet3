import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { IdentityKeyService } from './identity-key.service';

describe('IdentityKeyService', () => {
  it('derives a public RS256 JWK from the configured private key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const service = new IdentityKeyService(
      new ConfigService({
        IDENTITY_JWT_PRIVATE_KEY: privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        IDENTITY_JWT_KID: 'test-key',
      }),
    );

    expect(service.getJwks()).toMatchObject({
      keys: [{ kty: 'RSA', alg: 'RS256', kid: 'test-key', use: 'sig' }],
    });
    expect(service.getJwks().keys[0].n.length).toBeGreaterThan(300);
  });

  it('rejects non-PKCS#8 private key material', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(
      () =>
        new IdentityKeyService(
          new ConfigService({
            IDENTITY_JWT_PRIVATE_KEY: privateKey
              .export({ type: 'pkcs1', format: 'pem' })
              .toString(),
            IDENTITY_JWT_KID: 'test-key',
          }),
        ),
    ).toThrow('must be a PKCS#8 PEM key');
  });

  it('publishes the previous public key during a zero-downtime rotation', () => {
    const current = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const previous = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const previousJwk = previous.publicKey.export({ format: 'jwk' });
    const service = new IdentityKeyService(
      new ConfigService({
        IDENTITY_JWT_PRIVATE_KEY: current.privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        IDENTITY_JWT_KID: 'current-key',
        IDENTITY_JWT_PREVIOUS_PUBLIC_JWKS: JSON.stringify([
          { ...previousJwk, kid: 'previous-key', alg: 'RS256', use: 'sig' },
        ]),
      }),
    );

    expect(service.getJwks().keys.map((key) => key.kid)).toEqual([
      'current-key',
      'previous-key',
    ]);
  });
});
