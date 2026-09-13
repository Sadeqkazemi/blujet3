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
import { LoyaltyDlqDecisionDto } from './dto/loyalty-dlq-decision.dto';
import { LoyaltyDlqListDto } from './dto/loyalty-dlq-list.dto';
import { LoyaltyDlqAuthGuard } from './loyalty-dlq-auth.guard';
import { LoyaltyDlqStore } from './loyalty-dlq.store';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@ApiExcludeController()
@UseGuards(LoyaltyDlqAuthGuard)
@Controller('internal/v1/loyalty/dlq')
export class LoyaltyDlqController {
  constructor(private readonly dlq: LoyaltyDlqStore) {}

  @Get()
  async list(@Query(validation) query: LoyaltyDlqListDto) {
    return {
      success: true,
      data: await this.dlq.list(query.status, query.limit),
    };
  }

  @Post(':id/retry')
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: LoyaltyDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'retry', body.operatorId, body.reason),
    };
  }

  @Post(':id/skip')
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) body: LoyaltyDlqDecisionDto,
  ) {
    return {
      success: true,
      data: await this.dlq.approve(id, 'skip', body.operatorId, body.reason),
    };
  }
}
