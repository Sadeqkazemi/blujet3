import { Module } from '@nestjs/common';
import { IdentityKeyModule } from '../keys/identity-key.module';
import { IdentityController } from './identity.controller';

@Module({ imports: [IdentityKeyModule], controllers: [IdentityController] })
export class IdentityModule {}
