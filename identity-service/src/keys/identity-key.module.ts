import { Module } from '@nestjs/common';
import { IdentityKeyService } from './identity-key.service';

@Module({
  providers: [IdentityKeyService],
  exports: [IdentityKeyService],
})
export class IdentityKeyModule {}
