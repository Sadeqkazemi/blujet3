import { Module } from '@nestjs/common';
import { IdentityKeyModule } from '../keys/identity-key.module';
import { HealthController } from './health.controller';

@Module({ imports: [IdentityKeyModule], controllers: [HealthController] })
export class HealthModule {}
