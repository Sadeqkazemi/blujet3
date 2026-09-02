import { Module } from '@nestjs/common';
import { NiraService } from './nira.service';
import { NIRA_PROVIDER } from '../../common/nira/nira-provider.interface';
import { MockNiraProvider } from '../../common/nira/mock-nira.provider';

@Module({
  providers: [
    NiraService,
    { provide: NIRA_PROVIDER, useClass: MockNiraProvider },
  ],
  exports: [NiraService],
})
export class NiraModule {}
