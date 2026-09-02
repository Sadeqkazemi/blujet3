import { Controller, Get } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('internal')
@Controller('internal/v1/capabilities')
export class CapabilitiesController {
  @Get()
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiOkResponse({ description: 'Truthful PSS rollout capabilities' })
  getCapabilities() {
    return {
      service: 'blujet-pss',
      contractVersion: 'v1',
      salesEnabled: false,
      capabilities: {
        separateDatabase: true,
        internalAuthentication: true,
        idempotentCommands: true,
        transactionalOutbox: true,
        multiSegmentOrders: false,
        electronicTickets: false,
        flightCoupons: false,
        emd: false,
        nira: false,
        ndc: false,
        interline: false,
      },
    } as const;
  }
}
