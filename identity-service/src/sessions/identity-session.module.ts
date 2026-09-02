import { Module } from '@nestjs/common';
import { IdentitySessionStore } from './identity-session.store';

@Module({
  providers: [IdentitySessionStore],
  exports: [IdentitySessionStore],
})
export class IdentitySessionModule {}
