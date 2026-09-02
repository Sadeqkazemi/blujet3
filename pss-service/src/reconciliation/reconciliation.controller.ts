import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ShadowReconciliationDto } from './dto/shadow-reconciliation.dto';
import { ShadowReconciliationService } from './shadow-reconciliation.service';

@ApiTags('internal-reconciliation')
@Controller('internal/v1/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ShadowReconciliationService) {}

  @Post('shadow')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiOkResponse({ description: 'Website-to-PSS shadow count differences' })
  compare(@Body() input: ShadowReconciliationDto) {
    return this.reconciliation.compare(input);
  }
}
