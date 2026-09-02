import { Global, Module } from '@nestjs/common';
import { IdentityJwtVerifierService } from './identity-jwt-verifier.service';
import { IdentityJwksCache } from './identity-jwks.cache';

@Global()
@Module({
  providers: [IdentityJwksCache, IdentityJwtVerifierService],
  exports: [IdentityJwksCache, IdentityJwtVerifierService],
})
export class IdentityCutoverModule {}
