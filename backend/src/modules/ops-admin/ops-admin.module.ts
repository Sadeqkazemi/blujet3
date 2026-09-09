import { Module } from '@nestjs/common';
import { OpsAdminController } from './ops-admin.controller';
import { OpsAdminInternalAuthGuard } from './ops-admin-internal-auth.guard';
import { OpsAdminReadService } from './ops-admin-read.service';

@Module({
  controllers: [OpsAdminController],
  providers: [OpsAdminReadService, OpsAdminInternalAuthGuard],
})
export class OpsAdminModule {}
