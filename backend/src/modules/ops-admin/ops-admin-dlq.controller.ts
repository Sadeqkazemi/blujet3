import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { OpsAdminDlqDecisionDto } from './dto/ops-admin-dlq-decision.dto';
import { OpsAdminDlqListDto } from './dto/ops-admin-dlq-list.dto';
import { OpsAdminDlqAuthGuard } from './ops-admin-dlq-auth.guard';
import { OpsAdminDlqStore } from './ops-admin-dlq.store';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@ApiExcludeController()
@UseGuards(OpsAdminDlqAuthGuard)
@Controller('internal/v1/ops-admin/dlq')
export class OpsAdminDlqController {
  constructor(private readonly dlq: OpsAdminDlqStore) {}

  @Get()
  async list(@Query(validation) query: OpsAdminDlqListDto) {
    return {
      success: true,
      data: await this.dlq.list(query.status, query.limit),
    };
  }

  @Post(':id/retry')
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: OpsAdminDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'retry', body.operatorId, body.reason),
    };
  }

  @Post(':id/skip')
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: OpsAdminDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'skip', body.operatorId, body.reason),
    };
  }
}
