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
import { AgencyDlqDecisionDto } from './dto/agency-dlq-decision.dto';
import { AgencyDlqListDto } from './dto/agency-dlq-list.dto';
import { AgencyDlqAuthGuard } from './agency-dlq-auth.guard';
import { AgencyDlqStore } from './agency-dlq.store';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@ApiExcludeController()
@UseGuards(AgencyDlqAuthGuard)
@Controller('internal/v1/agency/dlq')
export class AgencyDlqController {
  constructor(private readonly dlq: AgencyDlqStore) {}

  @Get()
  async list(@Query(validation) query: AgencyDlqListDto) {
    return {
      success: true,
      data: await this.dlq.list(query.status, query.limit),
    };
  }

  @Post(':id/retry')
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: AgencyDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'retry', body.operatorId, body.reason),
    };
  }

  @Post(':id/skip')
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: AgencyDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'skip', body.operatorId, body.reason),
    };
  }
}
