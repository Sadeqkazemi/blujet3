import { Module } from '@nestjs/common';
import { ExperienceInternalClient } from './experience-internal.client';

@Module({
  providers: [ExperienceInternalClient],
  exports: [ExperienceInternalClient],
})
export class ExperienceClientModule {}
