import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, KeyObject } from 'node:crypto';

export interface IdentityPublicJwk {
  kty: 'RSA';
  n: string;
  e: string;
  use: 'sig';
  alg: 'RS256';
  kid: string;
}

export interface IdentityJwksDocument {
  keys: IdentityPublicJwk[];
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n');
}

@Injectable()
export class IdentityKeyService {
  private readonly privateKey: KeyObject;
  private readonly publicJwk: IdentityPublicJwk;

  constructor(config: ConfigService) {
    const privateKeyPem = normalizePem(
      config.getOrThrow<string>('IDENTITY_JWT_PRIVATE_KEY'),
    );
    if (!privateKeyPem.includes('-----BEGIN PRIVATE KEY-----')) {
      throw new Error('IDENTITY_JWT_PRIVATE_KEY must be a PKCS#8 PEM key');
    }
    this.privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey(this.privateKey);
    const jwk = publicKey.export({ format: 'jwk' });
    if (
      jwk.kty !== 'RSA' ||
      typeof jwk.n !== 'string' ||
      typeof jwk.e !== 'string'
    ) {
      throw new Error('IDENTITY_JWT_PRIVATE_KEY must contain an RSA key');
    }
    this.publicJwk = {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
      use: 'sig',
      alg: 'RS256',
      kid: config.getOrThrow<string>('IDENTITY_JWT_KID'),
    };
  }

  getPrivateKey(): KeyObject {
    return this.privateKey;
  }

  getJwks(): IdentityJwksDocument {
    return { keys: [this.publicJwk] };
  }

  getMetadata(): Pick<IdentityPublicJwk, 'kid' | 'alg' | 'use'> {
    return {
      kid: this.publicJwk.kid,
      alg: this.publicJwk.alg,
      use: this.publicJwk.use,
    };
  }
}
