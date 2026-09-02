import { Module } from '@nestjs/common';
import { IdentityKeyModule } from '../keys/identity-key.module';
import { IdentityController } from './identity.controller';
import { IdentitySessionModule } from '../sessions/identity-session.module';
import { IdentityTokenController } from '../tokens/identity-token.controller';
import { IdentityTokenService } from '../tokens/identity-token.service';

@Module({
  imports: [IdentityKeyModule, IdentitySessionModule],
  controllers: [IdentityController, IdentityTokenController],
  providers: [IdentityTokenService],
})
export class IdentityModule {}
