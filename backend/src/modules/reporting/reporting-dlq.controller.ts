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
import { ReportingDlqDecisionDto } from './dto/reporting-dlq-decision.dto';
import { ReportingDlqListDto } from './dto/reporting-dlq-list.dto';
import { ReportingDlqAuthGuard } from './reporting-dlq-auth.guard';
import { ReportingDlqStore } from './reporting-dlq.store';

@ApiExcludeController()
@UseGuards(ReportingDlqAuthGuard)
@Controller('internal/v1/reporting/dlq')
export class ReportingDlqController {
  constructor(private readonly dlq: ReportingDlqStore) {}

  @Get()
  async list(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: ReportingDlqListDto,
  ) {
    return {
      success: true,
      data: await this.dlq.list(query.status, query.limit),
    };
  }

  @Post(':id/retry')
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: ReportingDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'retry', body.operatorId, body.reason),
    };
  }

  @Post(':id/skip')
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: ReportingDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'skip', body.operatorId, body.reason),
    };
  }
}
